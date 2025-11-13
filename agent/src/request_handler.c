/**
 * Gestionnaire de requêtes client
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <json-c/json.h>
#include <time.h>

#include "agent.h"
#include "socket_server.h"
#include "ssh_handler.h"
#include "request_handler.h"

/**
 * Traiter une requête client
 */
void* handle_client_request(void *arg) {
    int client_fd = *(int *)arg;
    free(arg);

    printf("[Handler] Traitement de la requête (fd=%d)\n", client_fd);

    // Lire la commande
    command_t *cmd = NULL;
    if (socket_read_command(client_fd, &cmd) < 0) {
        fprintf(stderr, "[Handler] Erreur lecture commande\n");
        close(client_fd);
        return NULL;
    }

    // Traiter selon le type de commande
    response_code_t code = RESP_OK;
    char *response_data = NULL;

    switch (cmd->cmd_type) {
        case CMD_PING:
            printf("[Handler] Commande: PING\n");
            response_data = strdup("{\"status\":\"pong\",\"agent\":\"krown-agent v1.0\"}");
            break;

        case CMD_SSH_CONNECT:
            printf("[Handler] Commande: SSH_CONNECT\n");
            code = handle_ssh_connect(cmd->data, &response_data);
            break;

        case CMD_SSH_DISCONNECT:
            printf("[Handler] Commande: SSH_DISCONNECT\n");
            code = handle_ssh_disconnect(cmd->data, &response_data);
            break;

        case CMD_SSH_EXECUTE:
            printf("[Handler] Commande: SSH_EXECUTE\n");
            code = handle_ssh_execute(cmd->data, &response_data);
            break;

        case CMD_SSH_STATUS:
            printf("[Handler] Commande: SSH_STATUS\n");
            code = handle_ssh_status(cmd->data, &response_data);
            break;

        case CMD_LIST_SESSIONS:
            printf("[Handler] Commande: LIST_SESSIONS\n");
            code = handle_list_sessions(&response_data);
            break;

        default:
            printf("[Handler] Commande inconnue: %u\n", cmd->cmd_type);
            code = RESP_INVALID_CMD;
            response_data = strdup("{\"error\":\"Commande inconnue\"}");
            break;
    }

    // Envoyer la réponse
    if (response_data) {
        socket_send_response(client_fd, code, response_data);
        free(response_data);
    } else {
        socket_send_response(client_fd, RESP_ERROR, "{\"error\":\"Erreur interne\"}");
    }

    // Nettoyage
    free(cmd);
    close(client_fd);
    printf("[Handler] Requête traitée (fd=%d)\n", client_fd);

    return NULL;
}
