/**
 * Krown Agent - En-têtes principaux
 */

#ifndef KROWN_AGENT_H
#define KROWN_AGENT_H

#include <stdint.h>
#include <stdbool.h>

// Version du protocole
#define PROTOCOL_VERSION 1

// Types de commandes
typedef enum {
    CMD_PING = 1,
    CMD_SSH_CONNECT = 2,
    CMD_SSH_DISCONNECT = 3,
    CMD_SSH_EXECUTE = 4,
    CMD_SSH_STATUS = 5,
    CMD_LIST_SESSIONS = 6
} command_type_t;

// Codes de réponse
typedef enum {
    RESP_OK = 0,
    RESP_ERROR = 1,
    RESP_INVALID_CMD = 2,
    RESP_SSH_ERROR = 3
} response_code_t;

// Structure de commande
typedef struct {
    uint32_t version;
    uint32_t cmd_type;
    uint32_t data_len;
    char data[];  // Données JSON
} command_t;

// Structure de réponse
typedef struct {
    uint32_t version;
    uint32_t code;
    uint32_t data_len;
    char data[];  // Données JSON
} response_t;

// Fonction de traitement des requêtes client
void* handle_client_request(void *arg);

#endif // KROWN_AGENT_H

