/**
 * Gestionnaire SSH - Utilise libssh pour les connexions
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <pthread.h>
#include <stdbool.h>
#include <json-c/json.h>
#include <libssh/libssh.h>

#include "ssh_handler.h"
#include "agent.h"

#define MAX_SESSIONS 100

// Structure de session SSH
typedef struct {
    char session_id[64];
    ssh_session session;
    bool connected;
    time_t created_at;
} ssh_session_t;

static ssh_session_t sessions[MAX_SESSIONS];
static int session_count = 0;
static pthread_mutex_t sessions_mutex = PTHREAD_MUTEX_INITIALIZER;

/**
 * Initialiser le gestionnaire SSH
 */
int ssh_handler_init(void) {
    // Initialiser libssh
    ssh_init();
    
    // Initialiser le tableau de sessions
    memset(sessions, 0, sizeof(sessions));
    session_count = 0;

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
        if (sessions[i].connected && sessions[i].session) {
            ssh_disconnect(sessions[i].session);
            ssh_free(sessions[i].session);
        }
    }
    
    session_count = 0;
    pthread_mutex_unlock(&sessions_mutex);
    
    ssh_finalize();
    printf("[SSH] Gestionnaire nettoyé\n");
}

/**
 * Trouver une session par ID
 */
static ssh_session_t* find_session(const char *session_id) {
    pthread_mutex_lock(&sessions_mutex);
    
    for (int i = 0; i < session_count; i++) {
        if (strcmp(sessions[i].session_id, session_id) == 0) {
            pthread_mutex_unlock(&sessions_mutex);
            return &sessions[i];
        }
    }
    
    pthread_mutex_unlock(&sessions_mutex);
    return NULL;
}

/**
 * Gérer la connexion SSH
 */
response_code_t handle_ssh_connect(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = strdup("{\"error\":\"JSON invalide\"}");
        return RESP_ERROR;
    }

    json_object *host_obj, *port_obj, *user_obj, *pass_obj, *key_obj;
    const char *host, *username, *password = NULL, *private_key = NULL;
    int port = 22;

    json_object_object_get_ex(root, "host", &host_obj);
    json_object_object_get_ex(root, "username", &user_obj);
    json_object_object_get_ex(root, "port", &port_obj);
    json_object_object_get_ex(root, "password", &pass_obj);
    json_object_object_get_ex(root, "private_key", &key_obj);

    if (!host_obj || !user_obj) {
        json_object_put(root);
        *response = strdup("{\"error\":\"host et username requis\"}");
        return RESP_ERROR;
    }

    host = json_object_get_string(host_obj);
    username = json_object_get_string(user_obj);
    if (port_obj) port = json_object_get_int(port_obj);
    if (pass_obj) password = json_object_get_string(pass_obj);
    if (key_obj) private_key = json_object_get_string(key_obj);

    // Créer la session SSH
    ssh_session session = ssh_new();
    if (!session) {
        json_object_put(root);
        *response = strdup("{\"error\":\"Impossible de créer la session SSH\"}");
        return RESP_SSH_ERROR;
    }

    ssh_options_set(session, SSH_OPTIONS_HOST, host);
    ssh_options_set(session, SSH_OPTIONS_PORT, &port);
    ssh_options_set(session, SSH_OPTIONS_USER, username);

    // Connexion
    int rc = ssh_connect(session);
    if (rc != SSH_OK) {
        char error_msg[256];
        snprintf(error_msg, sizeof(error_msg), "{\"error\":\"Échec connexion: %s\"}", ssh_get_error(session));
        *response = strdup(error_msg);
        ssh_free(session);
        json_object_put(root);
        return RESP_SSH_ERROR;
    }

    // Authentification
    printf("[SSH] Tentative d'authentification pour %s@%s:%d\n", username, host, port);
    
    // Obtenir les méthodes d'authentification disponibles AVANT d'essayer
    int auth_methods = ssh_userauth_list(session, username);
    printf("[SSH] Méthodes d'authentification disponibles: ");
    if (auth_methods & SSH_AUTH_METHOD_PUBLICKEY) printf("publickey ");
    if (auth_methods & SSH_AUTH_METHOD_PASSWORD) printf("password ");
    if (auth_methods & SSH_AUTH_METHOD_HOSTBASED) printf("hostbased ");
    if (auth_methods & SSH_AUTH_METHOD_INTERACTIVE) printf("keyboard-interactive ");
    printf("\n");
    
    if (password && strlen(password) > 0) {
        printf("[SSH] Méthode: mot de passe (longueur: %zu)\n", strlen(password));
        
        // Vérifier que le serveur accepte l'authentification par mot de passe
        if (!(auth_methods & SSH_AUTH_METHOD_PASSWORD)) {
            printf("[SSH] ERREUR: Le serveur n'accepte pas l'authentification par mot de passe\n");
            char error_msg[256];
            snprintf(error_msg, sizeof(error_msg), 
                    "{\"error\":\"Le serveur SSH n'accepte pas l'authentification par mot de passe\"}");
            *response = strdup(error_msg);
            ssh_disconnect(session);
            ssh_free(session);
            json_object_put(root);
            return RESP_SSH_ERROR;
        }
        
        rc = ssh_userauth_password(session, NULL, password);
        
        if (rc == SSH_AUTH_SUCCESS) {
            printf("[SSH] Authentification par mot de passe réussie\n");
        } else {
            printf("[SSH] Échec authentification par mot de passe: %s (code: %d)\n", 
                   ssh_get_error(session), rc);
            
            // Essayer d'obtenir plus d'informations sur l'erreur
            if (rc == SSH_AUTH_DENIED) {
                printf("[SSH] Accès refusé - le mot de passe est peut-être incorrect\n");
            } else if (rc == SSH_AUTH_PARTIAL) {
                printf("[SSH] Authentification partielle - méthode supplémentaire requise\n");
            }
        }
    } else if (private_key && strlen(private_key) > 0) {
        printf("[SSH] Méthode: clé privée (non implémentée)\n");
        // TODO: Implémenter l'authentification par clé
        rc = SSH_AUTH_ERROR;
    } else {
        printf("[SSH] Méthode: clé publique automatique\n");
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
        char error_msg[512];
        
        // Obtenir plus de détails sur l'erreur
        int auth_methods = ssh_userauth_list(session, username);
        char methods_str[128] = "";
        if (auth_methods & SSH_AUTH_METHOD_PUBLICKEY) strcat(methods_str, "publickey,");
        if (auth_methods & SSH_AUTH_METHOD_PASSWORD) strcat(methods_str, "password,");
        if (auth_methods & SSH_AUTH_METHOD_HOSTBASED) strcat(methods_str, "hostbased,");
        if (auth_methods & SSH_AUTH_METHOD_INTERACTIVE) strcat(methods_str, "keyboard-interactive,");
        
        // Retirer la virgule finale
        size_t len = strlen(methods_str);
        if (len > 0 && methods_str[len-1] == ',') {
            methods_str[len-1] = '\0';
        }
        
        snprintf(error_msg, sizeof(error_msg), 
                "{\"error\":\"Échec authentification: %s\",\"auth_methods_available\":\"%s\",\"auth_code\":%d}", 
                error_str, methods_str, rc);
        *response = strdup(error_msg);
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
        sessions[session_count].session = session;
        sessions[session_count].connected = true;
        sessions[session_count].created_at = time(NULL);
        session_count++;

        char response_json[512];
        snprintf(response_json, sizeof(response_json), 
                "{\"session_id\":\"%s\",\"status\":\"connected\",\"host\":\"%s\",\"port\":%d}",
                session_id, host, port);
        *response = strdup(response_json);
        pthread_mutex_unlock(&sessions_mutex);
        json_object_put(root);
        return RESP_OK;
    }
    pthread_mutex_unlock(&sessions_mutex);

    ssh_disconnect(session);
    ssh_free(session);
    json_object_put(root);
    *response = strdup("{\"error\":\"Nombre maximum de sessions atteint\"}");
    return RESP_ERROR;
}

/**
 * Gérer la déconnexion SSH
 */
response_code_t handle_ssh_disconnect(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = strdup("{\"error\":\"JSON invalide\"}");
        return RESP_ERROR;
    }

    json_object *session_id_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    
    if (!session_id_obj) {
        json_object_put(root);
        *response = strdup("{\"error\":\"session_id requis\"}");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    ssh_session_t *sess = find_session(session_id);

    if (!sess || !sess->connected) {
        json_object_put(root);
        *response = strdup("{\"error\":\"Session introuvable\"}");
        return RESP_ERROR;
    }

    ssh_disconnect(sess->session);
    ssh_free(sess->session);
    sess->connected = false;

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
        *response = strdup("{\"error\":\"JSON invalide\"}");
        return RESP_ERROR;
    }

    json_object *session_id_obj, *command_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    json_object_object_get_ex(root, "command", &command_obj);

    if (!session_id_obj || !command_obj) {
        json_object_put(root);
        *response = strdup("{\"error\":\"session_id et command requis\"}");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    const char *command = json_object_get_string(command_obj);
    
    ssh_session_t *sess = find_session(session_id);
    if (!sess || !sess->connected) {
        json_object_put(root);
        *response = strdup("{\"error\":\"Session introuvable ou déconnectée\"}");
        return RESP_ERROR;
    }

    // Exécuter la commande
    ssh_channel channel = ssh_channel_new(sess->session);
    if (!channel) {
        json_object_put(root);
        *response = strdup("{\"error\":\"Impossible de créer le canal\"}");
        return RESP_SSH_ERROR;
    }

    if (ssh_channel_open_session(channel) != SSH_OK) {
        ssh_channel_free(channel);
        json_object_put(root);
        *response = strdup("{\"error\":\"Impossible d'ouvrir le canal\"}");
        return RESP_SSH_ERROR;
    }

    if (ssh_channel_request_exec(channel, command) != SSH_OK) {
        ssh_channel_close(channel);
        ssh_channel_free(channel);
        json_object_put(root);
        *response = strdup("{\"error\":\"Impossible d'exécuter la commande\"}");
        return RESP_SSH_ERROR;
    }

    // Lire la sortie
    char output[4096] = {0};
    int nbytes = ssh_channel_read(channel, output, sizeof(output) - 1, 0);
    
    int exit_status = ssh_channel_get_exit_status(channel);
    ssh_channel_close(channel);
    ssh_channel_free(channel);

    // Formater la réponse
    char response_json[8192];
    snprintf(response_json, sizeof(response_json),
            "{\"output\":\"%.*s\",\"exit_code\":%d,\"bytes_read\":%d}",
            nbytes, output, exit_status, nbytes);
    *response = strdup(response_json);

    json_object_put(root);
    return RESP_OK;
}

/**
 * Gérer le statut SSH
 */
response_code_t handle_ssh_status(const char *json_data, char **response) {
    json_object *root = json_tokener_parse(json_data);
    if (!root) {
        *response = strdup("{\"error\":\"JSON invalide\"}");
        return RESP_ERROR;
    }

    json_object *session_id_obj;
    json_object_object_get_ex(root, "session_id", &session_id_obj);
    
    if (!session_id_obj) {
        json_object_put(root);
        *response = strdup("{\"error\":\"session_id requis\"}");
        return RESP_ERROR;
    }

    const char *session_id = json_object_get_string(session_id_obj);
    ssh_session_t *sess = find_session(session_id);

    if (!sess) {
        *response = strdup("{\"status\":\"not_found\"}");
    } else if (sess->connected) {
        char response_json[256];
        snprintf(response_json, sizeof(response_json),
                "{\"status\":\"connected\",\"created_at\":%ld}",
                sess->created_at);
        *response = strdup(response_json);
    } else {
        *response = strdup("{\"status\":\"disconnected\"}");
    }

    json_object_put(root);
    return RESP_OK;
}

/**
 * Lister toutes les sessions
 */
response_code_t handle_list_sessions(char **response) {
    pthread_mutex_lock(&sessions_mutex);
    
    char *json = malloc(4096);
    strcpy(json, "{\"sessions\":[");
    
    int count = 0;
    for (int i = 0; i < session_count; i++) {
        if (sessions[i].connected) {
            if (count > 0) strcat(json, ",");
            char session_json[256];
            snprintf(session_json, sizeof(session_json),
                    "{\"id\":\"%s\",\"status\":\"connected\",\"created_at\":%ld}",
                    sessions[i].session_id, sessions[i].created_at);
            strcat(json, session_json);
            count++;
        }
    }
    
    strcat(json, "],\"count\":");
    char count_str[16];
    snprintf(count_str, sizeof(count_str), "%d", count);
    strcat(json, count_str);
    strcat(json, "}");
    
    pthread_mutex_unlock(&sessions_mutex);
    *response = json;
    return RESP_OK;
}

