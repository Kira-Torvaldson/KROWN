/**
 * Serveur Socket Unix - Communication locale avec Node.js
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <errno.h>
#include <pthread.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <endian.h>

#include "socket_server.h"
#include "agent.h"
#include "ssh_handler.h"

#define MAX_CLIENTS 10
#define BUFFER_SIZE 4096
// Limite dure pour éviter OOM / abus. Le JSON doit rester petit.
#define MAX_COMMAND_DATA_LEN (1024 * 1024) /* 1 MiB */

static int read_exact(int fd, void *buf, size_t len) {
    uint8_t *p = (uint8_t *)buf;
    size_t off = 0;
    while (off < len) {
        ssize_t n = read(fd, p + off, len - off);
        if (n == 0) {
            // fermeture distante
            return -1;
        }
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        off += (size_t)n;
    }
    return 0;
}

static int write_exact(int fd, const void *buf, size_t len) {
    const uint8_t *p = (const uint8_t *)buf;
    size_t off = 0;
    while (off < len) {
        ssize_t n = write(fd, p + off, len - off);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        off += (size_t)n;
    }
    return 0;
}

/**
 * Démarrer le serveur socket Unix
 */
int socket_server_start(const char *socket_path) {
    int server_fd;
    struct sockaddr_un addr;

    // Supprimer le socket existant s'il existe
    unlink(socket_path);

    // Créer le socket
    server_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return -1;
    }

    // Configurer l'adresse
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socket_path, sizeof(addr.sun_path) - 1);

    // Rendre le socket non-bloquant
    int flags = fcntl(server_fd, F_GETFL, 0);
    fcntl(server_fd, F_SETFL, flags | O_NONBLOCK);

    // Bind
    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        return -1;
    }

    // Listen
    if (listen(server_fd, MAX_CLIENTS) < 0) {
        perror("listen");
        close(server_fd);
        return -1;
    }

    // Changer les permissions du socket
    chmod(socket_path, 0666);

    printf("[Socket] Serveur démarré sur %s\n", socket_path);
    return server_fd;
}

/**
 * Accepter une nouvelle connexion
 */
int socket_server_accept(int server_fd) {
    struct sockaddr_un client_addr;
    socklen_t client_len = sizeof(client_addr);
    
    int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
    if (client_fd < 0) {
        // EAGAIN/EWOULDBLOCK sont normaux pour un socket non-bloquant
        // ECONNABORTED peut se produire si la connexion est fermée avant accept()
        if (errno != EAGAIN && errno != EWOULDBLOCK && errno != ECONNABORTED) {
            perror("accept");
        }
        return -1;
    }

    return client_fd;
}

/**
 * Lire une commande depuis le client
 */
int socket_read_command(int client_fd, command_t **cmd_out) {
    if (!cmd_out) {
        fprintf(stderr, "[Socket] Erreur: cmd_out est NULL\n");
        return -1;
    }

    // Lire l'en-tête (version + type + longueur)
    uint8_t header_buf[12];
    if (read_exact(client_fd, header_buf, sizeof(header_buf)) != 0) {
        perror("read header");
        return -1;
    }

    uint32_t version_le, cmd_type_le, data_len_le;
    memcpy(&version_le, header_buf + 0, sizeof(uint32_t));
    memcpy(&cmd_type_le, header_buf + 4, sizeof(uint32_t));
    memcpy(&data_len_le, header_buf + 8, sizeof(uint32_t));
    uint32_t version = le32toh(version_le);
    uint32_t cmd_type = le32toh(cmd_type_le);
    uint32_t data_len = le32toh(data_len_le);

    // Vérifier la version
    if (version != PROTOCOL_VERSION) {
        fprintf(stderr, "[Socket] Version de protocole invalide: %u\n", version);
        return -1;
    }

    // Vérifier la taille
    if (data_len > MAX_COMMAND_DATA_LEN) {
        fprintf(stderr, "[Socket] Payload trop grand: %u (max=%u)\n", data_len, (unsigned)MAX_COMMAND_DATA_LEN);
        return -1;
    }

    // Allouer la structure de commande
    size_t alloc_size = sizeof(command_t) + (size_t)data_len + 1;
    if (alloc_size < sizeof(command_t) || alloc_size > (sizeof(command_t) + (size_t)MAX_COMMAND_DATA_LEN + 1)) {
        fprintf(stderr, "[Socket] Taille allocation invalide\n");
        return -1;
    }
    command_t *cmd = malloc(alloc_size);
    if (!cmd) {
        perror("malloc");
        return -1;
    }

    cmd->version = version;
    cmd->cmd_type = cmd_type;
    cmd->data_len = data_len;

    // Lire les données
    if (data_len > 0) {
        if (read_exact(client_fd, cmd->data, data_len) != 0) {
            perror("read data");
            free(cmd);
            return -1;
        }
        cmd->data[data_len] = '\0';
    } else {
        cmd->data[0] = '\0';
    }

    *cmd_out = cmd;
    return 0;
}

/**
 * Envoyer une réponse au client
 */
int socket_send_response(int client_fd, response_code_t code, const char *data) {
    size_t data_len_sz = data ? strlen(data) : 0;
    if (data_len_sz > MAX_COMMAND_DATA_LEN) {
        // On refuse d'envoyer des réponses démesurées.
        data = "{\"error\":\"Réponse trop grande\"}";
        data_len_sz = strlen(data);
        code = RESP_TOO_LARGE;
    }
    uint32_t data_len = (uint32_t)data_len_sz;
    
    // En-tête
    uint8_t header_buf[12];
    uint32_t v = htole32(PROTOCOL_VERSION);
    uint32_t c = htole32((uint32_t)code);
    uint32_t l = htole32(data_len);
    memcpy(header_buf + 0, &v, sizeof(uint32_t));
    memcpy(header_buf + 4, &c, sizeof(uint32_t));
    memcpy(header_buf + 8, &l, sizeof(uint32_t));

    if (write_exact(client_fd, header_buf, sizeof(header_buf)) != 0) {
        perror("write header");
        return -1;
    }

    // Données
    if (data_len > 0) {
        if (write_exact(client_fd, data, data_len) != 0) {
            perror("write data");
            return -1;
        }
    }

    return 0;
}

/**
 * Arrêter le serveur
 */
void socket_server_stop(int server_fd, const char *socket_path) {
    if (server_fd >= 0) {
        close(server_fd);
    }
    unlink(socket_path);
    printf("[Socket] Serveur arrêté\n");
}

