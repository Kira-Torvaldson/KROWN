/**
 * Gestionnaire SSH - Utilise libssh pour les connexions
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <pthread.h>
#include <stdbool.h>
#include <json-c/json.h>
#include <libssh/libssh.h>
#include <errno.h>

#include "ssh_handler.h"
#include "agent.h"

#define MAX_SESSIONS 100
// Protection mémoire : limite dure de sortie par flux
#define MAX_EXEC_STDOUT (256 * 1024)
#define MAX_EXEC_STDERR (256 * 1024)
// Timeout de connexion SSH (secondes)
#define SSH_CONNECT_TIMEOUT_SECS 10
// Timeout d'inactivité d'exécution (millisecondes)
#define SSH_EXEC_IDLE_TIMEOUT_MS 15000

static uint64_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000ull + (uint64_t)ts.tv_nsec / 1000000ull;
}

static int append_bytes(char **buf, size_t *len, const char *src, size_t src_len, size_t max_len, bool *truncated) {
    if (*len >= max_len) {
        if (truncated) *truncated = true;
        return 0;
    }
    size_t to_copy = src_len;
    if (*len + to_copy > max_len) {
        to_copy = max_len - *len;
        if (truncated) *truncated = true;
    }
    char *new_buf = realloc(*buf, *len + to_copy + 1);
    if (!new_buf) return -1;
    *buf = new_buf;
    memcpy(*buf + *len, src, to_copy);
    *len += to_copy;
    (*buf)[*len] = '\0';
    return 0;
}

// Structure de session SSH
typedef struct {
    char session_id[64];
    ssh_session session;
    bool connected;
    time_t created_at;
    pthread_mutex_t mutex; // protège session/connected
} ssh_session_t;

static ssh_session_t sessions[MAX_SESSIONS];
static int session_count = 0;
static pthread_mutex_t sessions_mutex = PTHREAD_MUTEX_INITIALIZER;

static ssh_session_t* find_session_locked(const char *session_id) {
    for (int i = 0; i < session_count; i++) {
        if (strcmp(sessions[i].session_id, session_id) == 0) {
            return &sessions[i];
        }
    }
    return NULL;
}

static char* json_error(const char *message) {
    json_object *obj = json_object_new_object();
    json_object_object_add(obj, "error", json_object_new_string(message ? message : "Erreur"));
    const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
    char *out = strdup(s);
    json_object_put(obj);
    return out;
}

static const char* known_host_status_str(enum ssh_known_hosts_e state) {
    switch (state) {
        case SSH_KNOWN_HOSTS_OK: return "ok";
        case SSH_KNOWN_HOSTS_CHANGED: return "changed";
        case SSH_KNOWN_HOSTS_OTHER: return "other";
        case SSH_KNOWN_HOSTS_UNKNOWN: return "unknown";
        case SSH_KNOWN_HOSTS_NOT_FOUND: return "not_found";
        case SSH_KNOWN_HOSTS_ERROR: return "error";
        default: return "unknown_state";
    }
}

static char* get_server_fingerprint_sha256(ssh_session session) {
    ssh_key srvkey = NULL;
    unsigned char *hash = NULL;
    size_t hlen = 0;
    char *fp = NULL;

    if (ssh_get_server_publickey(session, &srvkey) != SSH_OK) {
        return NULL;
    }
    if (ssh_get_publickey_hash(srvkey, SSH_PUBLICKEY_HASH_SHA256, &hash, &hlen) != SSH_OK) {
        ssh_key_free(srvkey);
        return NULL;
    }
    fp = ssh_get_fingerprint_hash(SSH_PUBLICKEY_HASH_SHA256, hash, hlen);
    ssh_clean_pubkey_hash(&hash);
    ssh_key_free(srvkey);
    return fp; // libéré via ssh_string_free_char()
}

static int verify_host_key_strict(ssh_session session, char **out_json_error) {
    enum ssh_known_hosts_e state = ssh_session_is_known_server(session);
    if (state == SSH_KNOWN_HOSTS_OK) {
        return 0;
    }

    char *fp = get_server_fingerprint_sha256(session);
    json_object *obj = json_object_new_object();
    json_object_object_add(obj, "error", json_object_new_string("Vérification host key échouée"));
    json_object_object_add(obj, "known_hosts_status", json_object_new_string(known_host_status_str(state)));
    if (fp) {
        json_object_object_add(obj, "fingerprint_sha256", json_object_new_string(fp));
        ssh_string_free_char(fp);
    }
    json_object_object_add(obj, "note", json_object_new_string("Refus strict: validez/ajoutez la host key dans known_hosts côté agent (pas de contournement)."));
    const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
    *out_json_error = strdup(s);
    json_object_put(obj);
    return -1;
}

/**
 * Initialiser le gestionnaire SSH
 */
int ssh_handler_init(void) {
    // Initialiser libssh
    ssh_init();
    
    // Initialiser le tableau de sessions
    memset(sessions, 0, sizeof(sessions));
    session_count = 0;
    for (int i = 0; i < MAX_SESSIONS; i++) {
        pthread_mutex_init(&sessions[i].mutex, NULL);
    }

    printf("[SSH] Gestionnaire initialisé\n");
    return 0;
}

/**
 * Nettoyer le gestionnaire SSH
 */
void ssh_handler_cleanup(void) {
    pthread_mutex_lock(&sessions_mutex);
    
    // Fermer toutes les sessions
    for (int i = 0; i < session_count; i++) {
        pthread_mutex_lock(&sessions[i].mutex);
        if (sessions[i].connected && sessions[i].session) {
            ssh_disconnect(sessions[i].session);
            ssh_free(sessions[i].session);
            sessions[i].session = NULL;
            sessions[i].connected = false;
        }
        pthread_mutex_unlock(&sessions[i].mutex);
    }
    
    session_count = 0;
    pthread_mutex_unlock(&sessions_mutex);
    
    ssh_finalize();
    printf("[SSH] Gestionnaire nettoyé\n");
}

/**
 * Gérer la connexion SSH
 */
response_code_t handle_ssh_connect(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = json_error("JSON invalide");
        return RESP_INVALID_JSON;
    }

    json_object *host_obj, *port_obj, *user_obj, *pass_obj, *key_obj, *passphrase_obj;
    const char *host, *username, *password = NULL, *private_key = NULL, *passphrase = NULL;
    int port = 22;

    json_object_object_get_ex(root, "host", &host_obj);
    json_object_object_get_ex(root, "username", &user_obj);
    json_object_object_get_ex(root, "port", &port_obj);
    json_object_object_get_ex(root, "password", &pass_obj);
    json_object_object_get_ex(root, "private_key", &key_obj);
    json_object_object_get_ex(root, "passphrase", &passphrase_obj);

    if (!host_obj || !user_obj) {
        json_object_put(root);
        *response = json_error("host et username requis");
        return RESP_ERROR;
    }

    host = json_object_get_string(host_obj);
    username = json_object_get_string(user_obj);
    if (port_obj) port = json_object_get_int(port_obj);
    if (pass_obj) {
        password = json_object_get_string(pass_obj);
        printf("[SSH] Mot de passe fourni: %s\n", (password && password[0]) ? "oui (refusé)" : "vide");
    }
    if (key_obj) private_key = json_object_get_string(key_obj);
    if (passphrase_obj) {
        passphrase = json_object_get_string(passphrase_obj);
        printf("[SSH] Passphrase reçue (longueur: %zu)\n", passphrase ? strlen(passphrase) : 0);
    }

    // Politique: authentification par clé uniquement (pas de mot de passe)
    if (password && password[0] != '\0') {
        json_object_put(root);
        *response = json_error("Authentification par mot de passe non supportée (clé SSH uniquement).");
        return RESP_SSH_ERROR;
    }

    // Créer la session SSH
    ssh_session session = ssh_new();
    if (!session) {
        json_object_put(root);
        *response = json_error("Impossible de créer la session SSH");
        return RESP_SSH_ERROR;
    }

    ssh_options_set(session, SSH_OPTIONS_HOST, host);
    ssh_options_set(session, SSH_OPTIONS_PORT, &port);
    ssh_options_set(session, SSH_OPTIONS_USER, username);
    int timeout_secs = SSH_CONNECT_TIMEOUT_SECS;
    ssh_options_set(session, SSH_OPTIONS_TIMEOUT, &timeout_secs);

    // Connexion
    int rc = ssh_connect(session);
    if (rc != SSH_OK) {
        const char *err = ssh_get_error(session);
        json_object *obj = json_object_new_object();
        json_object_object_add(obj, "error", json_object_new_string("Échec connexion SSH"));
        json_object_object_add(obj, "details", json_object_new_string(err ? err : "unknown"));
        const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
        *response = strdup(s);
        json_object_put(obj);
        ssh_free(session);
        json_object_put(root);
        return RESP_SSH_ERROR;
    }

    // Vérification stricte de la host key (known_hosts)
    char *hostkey_err = NULL;
    if (verify_host_key_strict(session, &hostkey_err) != 0) {
        printf("[SSH] Host key refusée: %s\n", hostkey_err ? hostkey_err : "unknown");
        *response = hostkey_err ? hostkey_err : json_error("Vérification host key échouée");
        ssh_disconnect(session);
        ssh_free(session);
        json_object_put(root);
        return RESP_SSH_ERROR;
    }

    // Authentification (clé uniquement)
    printf("[SSH] Tentative d'authentification pour %s@%s:%d\n", username, host, port);
    
    // Amorcer la phase d'auth
    (void)ssh_userauth_none(session, NULL);
    int auth_methods = ssh_userauth_list(session, NULL);
    printf("[SSH] Méthodes d'authentification disponibles: ");
    if (auth_methods & SSH_AUTH_METHOD_PUBLICKEY) printf("publickey ");
    if (auth_methods & SSH_AUTH_METHOD_PASSWORD) printf("password ");
    if (auth_methods & SSH_AUTH_METHOD_HOSTBASED) printf("hostbased ");
    if (auth_methods & SSH_AUTH_METHOD_INTERACTIVE) printf("keyboard-interactive ");
    printf("\n");
    
    if (private_key && strlen(private_key) > 0) {
        printf("[SSH] Méthode: clé privée (longueur: %zu)\n", strlen(private_key));
        
        // Vérifier que le serveur accepte l'authentification par clé publique
        if (!(auth_methods & SSH_AUTH_METHOD_PUBLICKEY)) {
            printf("[SSH] ERREUR: Le serveur n'accepte pas l'authentification par clé publique\n");
            *response = json_error("Le serveur SSH n'accepte pas l'authentification par clé publique");
            ssh_disconnect(session);
            ssh_free(session);
            json_object_put(root);
            return RESP_SSH_ERROR;
        }
        
        // Créer un fichier temporaire pour la clé privée
        char tmp_key_file[] = "/tmp/krown_ssh_key_XXXXXX";
        int tmp_fd = mkstemp(tmp_key_file);
        if (tmp_fd < 0) {
            printf("[SSH] ERREUR: Impossible de créer un fichier temporaire pour la clé\n");
            *response = json_error("Impossible de créer un fichier temporaire pour la clé privée");
            ssh_disconnect(session);
            ssh_free(session);
            json_object_put(root);
            return RESP_SSH_ERROR;
        }
        
        // Écrire la clé privée dans le fichier temporaire
        ssize_t written = write(tmp_fd, private_key, strlen(private_key));
        close(tmp_fd);
        
        if (written != (ssize_t)strlen(private_key)) {
            printf("[SSH] ERREUR: Impossible d'écrire la clé privée dans le fichier temporaire\n");
            unlink(tmp_key_file);
            *response = json_error("Impossible d'écrire la clé privée dans le fichier temporaire");
            ssh_disconnect(session);
            ssh_free(session);
            json_object_put(root);
            return RESP_SSH_ERROR;
        }
        
        // Changer les permissions du fichier (lecture seule pour le propriétaire)
        chmod(tmp_key_file, 0600);
        
        // Importer la clé privée (passphrase NULL si vide)
        const char *passphrase_opt = (passphrase && passphrase[0] != '\0') ? passphrase : NULL;
        ssh_key privkey = NULL;
        int import_rc = ssh_pki_import_privkey_file(tmp_key_file, passphrase_opt, NULL, NULL, &privkey);
        
        // Supprimer le fichier temporaire immédiatement après import
        unlink(tmp_key_file);
        
        if (import_rc != SSH_OK || privkey == NULL) {
            printf("[SSH] ERREUR: Impossible d'importer la clé privée: %s\n", 
                   import_rc == SSH_OK ? "clé NULL" : ssh_get_error(session));
            *response = json_error("Impossible d'importer la clé privée: format invalide/corrompu ou passphrase incorrecte");
            ssh_disconnect(session);
            ssh_free(session);
            json_object_put(root);
            return RESP_SSH_ERROR;
        }

        // Logs: type de clé importée
        enum ssh_keytypes_e kt = ssh_key_type(privkey);
        const char *kt_str = ssh_key_type_to_char(kt);
        printf("[SSH] Type de clé privée importée: %s\n", kt_str ? kt_str : "unknown");
        
        // Extraire la clé publique pour le débogage
        ssh_key pubkey = NULL;
        if (ssh_pki_export_privkey_to_pubkey(privkey, &pubkey) == SSH_OK && pubkey != NULL) {
            char *pubkey_str = NULL;
            if (ssh_pki_export_pubkey_base64(pubkey, &pubkey_str) == SSH_OK && pubkey_str != NULL) {
                // Afficher les 50 premiers caractères de la clé publique pour le débogage
                char pubkey_preview[64] = {0};
                strncpy(pubkey_preview, pubkey_str, 50);
                printf("[SSH] Clé publique (preview): %s...\n", pubkey_preview);
                printf("[SSH] Vérifiez que cette clé publique est dans ~/.ssh/authorized_keys sur le serveur\n");
                ssh_string_free_char(pubkey_str);
            }
            ssh_key_free(pubkey);
        }
        
        // Essayer d'abord avec ssh_userauth_try_publickey pour vérifier si la clé est acceptée
        int try_rc = ssh_userauth_try_publickey(session, NULL, privkey);
        if (try_rc == SSH_AUTH_SUCCESS) {
            printf("[SSH] La clé publique est acceptée par le serveur, tentative d'authentification...\n");
        } else if (try_rc == SSH_AUTH_DENIED) {
            printf("[SSH] ATTENTION: La clé publique n'est PAS dans authorized_keys sur le serveur\n");
            printf("[SSH] Vérifiez que la clé publique correspondante est dans ~/.ssh/authorized_keys\n");
        } else {
            printf("[SSH] Résultat du test de la clé: code %d\n", try_rc);
        }
        
        // Authentifier avec la clé privée
        rc = ssh_userauth_publickey(session, NULL, privkey);
        
        // Libérer la clé
        ssh_key_free(privkey);
        
        if (rc == SSH_AUTH_SUCCESS) {
            printf("[SSH] Authentification par clé privée réussie\n");
        } else {
            printf("[SSH] Échec authentification par clé privée: %s (code: %d)\n", 
                   ssh_get_error(session), rc);
            
            if (rc == SSH_AUTH_DENIED) {
                printf("[SSH] Accès refusé - causes possibles:\n");
                printf("[SSH]   1. La clé publique n'est pas dans ~/.ssh/authorized_keys sur le serveur\n");
                printf("[SSH]   2. Les permissions de ~/.ssh ou authorized_keys sont incorrectes (doivent être 700 et 600)\n");
                printf("[SSH]   3. La clé privée ne correspond pas à la clé publique dans authorized_keys\n");
                printf("[SSH]   4. Le serveur SSH a désactivé l'authentification par clé publique\n");
            } else if (rc == SSH_AUTH_PARTIAL) {
                printf("[SSH] Authentification partielle - méthode supplémentaire requise\n");
            } else if (rc == SSH_AUTH_ERROR) {
                printf("[SSH] Erreur lors de l'authentification - vérifiez les logs du serveur SSH\n");
            }
        }
    } else {
        printf("[SSH] Méthode: clé publique automatique (ssh-agent/keys locales)\n");
        rc = ssh_userauth_publickey_auto(session, NULL, NULL);
        
        if (rc == SSH_AUTH_SUCCESS) {
            printf("[SSH] Authentification par clé publique réussie\n");
        } else {
            printf("[SSH] Échec authentification par clé publique: %s (code: %d)\n", 
                   ssh_get_error(session), rc);
        }
    }

    if (rc != SSH_AUTH_SUCCESS) {
        const char *error_str = ssh_get_error(session);
        // Obtenir plus de détails sur l'erreur
        int auth_methods = ssh_userauth_list(session, NULL);
        json_object *obj = json_object_new_object();
        json_object_object_add(obj, "error", json_object_new_string("Échec authentification SSH"));
        json_object_object_add(obj, "details", json_object_new_string(error_str ? error_str : "unknown"));
        json_object_object_add(obj, "auth_code", json_object_new_int(rc));

        json_object *methods = json_object_new_array();
        if (auth_methods & SSH_AUTH_METHOD_PUBLICKEY) json_object_array_add(methods, json_object_new_string("publickey"));
        if (auth_methods & SSH_AUTH_METHOD_PASSWORD) json_object_array_add(methods, json_object_new_string("password"));
        if (auth_methods & SSH_AUTH_METHOD_HOSTBASED) json_object_array_add(methods, json_object_new_string("hostbased"));
        if (auth_methods & SSH_AUTH_METHOD_INTERACTIVE) json_object_array_add(methods, json_object_new_string("keyboard-interactive"));
        json_object_object_add(obj, "auth_methods_available", methods);

        const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
        *response = strdup(s);
        json_object_put(obj);
        ssh_disconnect(session);
        ssh_free(session);
        json_object_put(root);
        return RESP_SSH_ERROR;
    }

    // Enregistrer la session
    pthread_mutex_lock(&sessions_mutex);
    if (session_count < MAX_SESSIONS) {
        char session_id[64];
        snprintf(session_id, sizeof(session_id), "session_%d_%ld", session_count, time(NULL));
        
        strncpy(sessions[session_count].session_id, session_id, sizeof(sessions[session_count].session_id) - 1);
        pthread_mutex_lock(&sessions[session_count].mutex);
        sessions[session_count].session = session;
        sessions[session_count].connected = true;
        sessions[session_count].created_at = time(NULL);
        pthread_mutex_unlock(&sessions[session_count].mutex);
        session_count++;

        json_object *obj = json_object_new_object();
        json_object_object_add(obj, "session_id", json_object_new_string(session_id));
        json_object_object_add(obj, "status", json_object_new_string("connected"));
        json_object_object_add(obj, "host", json_object_new_string(host));
        json_object_object_add(obj, "port", json_object_new_int(port));
        const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
        *response = strdup(s);
        json_object_put(obj);
        pthread_mutex_unlock(&sessions_mutex);
        json_object_put(root);
        return RESP_OK;
    }
    pthread_mutex_unlock(&sessions_mutex);

    ssh_disconnect(session);
    ssh_free(session);
    json_object_put(root);
    *response = json_error("Nombre maximum de sessions atteint");
    return RESP_ERROR;
}

/**
 * Gérer la déconnexion SSH
 */
response_code_t handle_ssh_disconnect(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = json_error("JSON invalide");
        return RESP_INVALID_JSON;
    }

    json_object *session_id_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    
    if (!session_id_obj) {
        json_object_put(root);
        *response = json_error("session_id requis");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    pthread_mutex_lock(&sessions_mutex);
    ssh_session_t *sess = find_session_locked(session_id);
    if (!sess) {
        pthread_mutex_unlock(&sessions_mutex);
        json_object_put(root);
        *response = json_error("Session introuvable");
        return RESP_ERROR;
    }
    pthread_mutex_lock(&sess->mutex);
    pthread_mutex_unlock(&sessions_mutex);

    if (!sess->connected || !sess->session) {
        pthread_mutex_unlock(&sess->mutex);
        json_object_put(root);
        *response = json_error("Session introuvable");
        return RESP_ERROR;
    }

    sess->connected = false;
    ssh_disconnect(sess->session);
    ssh_free(sess->session);
    sess->session = NULL;
    pthread_mutex_unlock(&sess->mutex);

    *response = strdup("{\"status\":\"disconnected\"}");
    json_object_put(root);
    return RESP_OK;
}

/**
 * Gérer l'exécution de commande SSH
 */
response_code_t handle_ssh_execute(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = json_error("JSON invalide");
        return RESP_INVALID_JSON;
    }

    json_object *session_id_obj, *command_obj, *request_pty_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    json_object_object_get_ex(root, "command", &command_obj);
    json_object_object_get_ex(root, "request_pty", &request_pty_obj);

    if (!session_id_obj || !command_obj) {
        json_object_put(root);
        *response = json_error("session_id et command requis");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    const char *command = json_object_get_string(command_obj);
    bool request_pty = false;
    if (request_pty_obj) {
        request_pty = json_object_get_boolean(request_pty_obj) ? true : false;
    }
    
    pthread_mutex_lock(&sessions_mutex);
    ssh_session_t *sess = find_session_locked(session_id);
    if (!sess) {
        pthread_mutex_unlock(&sessions_mutex);
        json_object_put(root);
        *response = json_error("Session introuvable ou déconnectée");
        return RESP_ERROR;
    }
    pthread_mutex_lock(&sess->mutex);
    pthread_mutex_unlock(&sessions_mutex);
    if (!sess->connected || !sess->session) {
        pthread_mutex_unlock(&sess->mutex);
        json_object_put(root);
        *response = json_error("Session introuvable ou déconnectée");
        return RESP_ERROR;
    }

    // Exécuter la commande
    ssh_channel channel = ssh_channel_new(sess->session);
    if (!channel) {
        pthread_mutex_unlock(&sess->mutex);
        json_object_put(root);
        *response = json_error("Impossible de créer le canal");
        return RESP_SSH_ERROR;
    }

    if (ssh_channel_open_session(channel) != SSH_OK) {
        ssh_channel_free(channel);
        pthread_mutex_unlock(&sess->mutex);
        json_object_put(root);
        *response = json_error("Impossible d'ouvrir le canal");
        return RESP_SSH_ERROR;
    }

    bool pty_used = false;
    if (request_pty) {
        // Un PTY peut être nécessaire pour certaines commandes interactives (sudo requiretty, etc.)
        if (ssh_channel_request_pty(channel) == SSH_OK) {
            pty_used = true;
        } else {
            // On n'échoue pas la commande uniquement pour ça: on continue sans PTY.
            printf("[SSH] Avertissement: échec request_pty: %s\n", ssh_get_error(sess->session));
        }
    }

    if (ssh_channel_request_exec(channel, command) != SSH_OK) {
        ssh_channel_close(channel);
        ssh_channel_free(channel);
        pthread_mutex_unlock(&sess->mutex);
        json_object_put(root);
        *response = json_error("Impossible d'exécuter la commande");
        return RESP_SSH_ERROR;
    }

    // Lire stdout ET stderr en boucle, avec timeout d'inactivité
    char *stdout_buf = calloc(1, 1);
    char *stderr_buf = calloc(1, 1);
    size_t stdout_len = 0;
    size_t stderr_len = 0;
    int bytes_stdout = 0;
    int bytes_stderr = 0;
    bool truncated_stdout = false;
    bool truncated_stderr = false;

    uint64_t last_activity = now_ms();
    char buf[4096];
    for (;;) {
        bool progressed = false;

        int n_out = ssh_channel_read_timeout(channel, buf, sizeof(buf), 0, 1000);
        if (n_out > 0) {
            if (append_bytes(&stdout_buf, &stdout_len, buf, (size_t)n_out, MAX_EXEC_STDOUT, &truncated_stdout) != 0) {
                break;
            }
            bytes_stdout += n_out;
            progressed = true;
        } else if (n_out == SSH_ERROR) {
            break;
        }

        int n_err = ssh_channel_read_timeout(channel, buf, sizeof(buf), 1, 1000);
        if (n_err > 0) {
            if (append_bytes(&stderr_buf, &stderr_len, buf, (size_t)n_err, MAX_EXEC_STDERR, &truncated_stderr) != 0) {
                break;
            }
            bytes_stderr += n_err;
            progressed = true;
        } else if (n_err == SSH_ERROR) {
            break;
        }

        if (progressed) {
            last_activity = now_ms();
        }

        // Fin normale
        if (ssh_channel_is_eof(channel)) {
            break;
        }

        // Timeout d'inactivité
        if (now_ms() - last_activity > SSH_EXEC_IDLE_TIMEOUT_MS) {
            printf("[SSH] Timeout d'inactivité (%d ms) pour la commande\n", SSH_EXEC_IDLE_TIMEOUT_MS);
            break;
        }

        // Si on a tronqué les 2 flux, inutile d'attendre plus.
        if (truncated_stdout && truncated_stderr) {
            break;
        }
    }

    int exit_status = ssh_channel_get_exit_status(channel);
    ssh_channel_close(channel);
    ssh_channel_free(channel);
    pthread_mutex_unlock(&sess->mutex);

    // Formater la réponse
    json_object *obj = json_object_new_object();
    json_object_object_add(obj, "output", json_object_new_string_len(stdout_buf ? stdout_buf : "", (int)stdout_len));
    json_object_object_add(obj, "stderr", json_object_new_string_len(stderr_buf ? stderr_buf : "", (int)stderr_len));
    json_object_object_add(obj, "exit_code", json_object_new_int(exit_status));
    json_object_object_add(obj, "bytes_stdout", json_object_new_int(bytes_stdout));
    json_object_object_add(obj, "bytes_stderr", json_object_new_int(bytes_stderr));
    json_object_object_add(obj, "pty_used", json_object_new_boolean(pty_used));
    if (truncated_stdout || truncated_stderr) {
        json_object *tr = json_object_new_object();
        json_object_object_add(tr, "stdout", json_object_new_boolean(truncated_stdout));
        json_object_object_add(tr, "stderr", json_object_new_boolean(truncated_stderr));
        json_object_object_add(obj, "truncated", tr);
    }
    const char *s = json_object_to_json_string_ext(obj, JSON_C_TO_STRING_PLAIN);
    *response = strdup(s);
    json_object_put(obj);
    free(stdout_buf);
    free(stderr_buf);

    json_object_put(root);
    return RESP_OK;
}

/**
 * Gérer le statut SSH
 */
response_code_t handle_ssh_status(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = json_error("JSON invalide");
        return RESP_INVALID_JSON;
    }

    json_object *session_id_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    
    if (!session_id_obj) {
        json_object_put(root);
        *response = json_error("session_id requis");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    pthread_mutex_lock(&sessions_mutex);
    ssh_session_t *sess = find_session_locked(session_id);
    if (!sess) {
        pthread_mutex_unlock(&sessions_mutex);
        *response = strdup("{\"status\":\"not_found\"}");
        json_object_put(root);
        return RESP_OK;
    }
    pthread_mutex_lock(&sess->mutex);
    pthread_mutex_unlock(&sessions_mutex);

    if (sess->connected) {
        char response_json[256];
        snprintf(response_json, sizeof(response_json),
                "{\"status\":\"connected\",\"created_at\":%ld}",
                sess->created_at);
        *response = strdup(response_json);
    } else {
        *response = strdup("{\"status\":\"disconnected\"}");
    }
    pthread_mutex_unlock(&sess->mutex);

    json_object_put(root);
    return RESP_OK;
}

/**
 * Lister toutes les sessions
 */
response_code_t handle_list_sessions(char **response) {
    pthread_mutex_lock(&sessions_mutex);
    json_object *root = json_object_new_object();
    json_object *arr = json_object_new_array();
    int count = 0;
    for (int i = 0; i < session_count; i++) {
        pthread_mutex_lock(&sessions[i].mutex);
        if (sessions[i].connected) {
            json_object *s = json_object_new_object();
            json_object_object_add(s, "id", json_object_new_string(sessions[i].session_id));
            json_object_object_add(s, "status", json_object_new_string("connected"));
            json_object_object_add(s, "created_at", json_object_new_int64((int64_t)sessions[i].created_at));
            json_object_array_add(arr, s);
            count++;
        }
        pthread_mutex_unlock(&sessions[i].mutex);
    }
    json_object_object_add(root, "sessions", arr);
    json_object_object_add(root, "count", json_object_new_int(count));
    pthread_mutex_unlock(&sessions_mutex);

    const char *s = json_object_to_json_string_ext(root, JSON_C_TO_STRING_PLAIN);
    *response = strdup(s);
    json_object_put(root);
    return RESP_OK;
}

