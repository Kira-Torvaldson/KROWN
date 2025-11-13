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

#include "socket_server.h"
#include "agent.h"
#include "ssh_handler.h"

#define MAX_CLIENTS 10
#define BUFFER_SIZE 4096

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

    printf("[Socket] Nouvelle connexion acceptée (fd=%d)\n", client_fd);
    return client_fd;
}

/**
 * Lire une commande depuis le client
 */
int socket_read_command(int client_fd, command_t **cmd_out) {
    // Lire l'en-tête (version + type + longueur)
    uint32_t header[3];
    ssize_t n = read(client_fd, header, sizeof(header));
    
    if (n < (ssize_t)sizeof(header)) {
        if (n < 0) perror("read header");
        return -1;
    }

    uint32_t version = header[0];
    uint32_t cmd_type = header[1];
    uint32_t data_len = header[2];

    // Vérifier la version
    if (version != PROTOCOL_VERSION) {
        fprintf(stderr, "[Socket] Version de protocole invalide: %u\n", version);
        return -1;
    }

    // Allouer la structure de commande
    command_t *cmd = malloc(sizeof(command_t) + data_len + 1);
    if (!cmd) {
        perror("malloc");
        return -1;
    }

    cmd->version = version;
    cmd->cmd_type = cmd_type;
    cmd->data_len = data_len;

    // Lire les données
    if (data_len > 0) {
        n = read(client_fd, cmd->data, data_len);
        if (n < (ssize_t)data_len) {
            if (n < 0) perror("read data");
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
    uint32_t data_len = data ? strlen(data) : 0;
    
    // En-tête
    uint32_t header[3] = {
        PROTOCOL_VERSION,
        (uint32_t)code,
        data_len
    };

    if (write(client_fd, header, sizeof(header)) < (ssize_t)sizeof(header)) {
        perror("write header");
        return -1;
    }

    // Données
    if (data_len > 0) {
        if (write(client_fd, data, data_len) < (ssize_t)data_len) {
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

