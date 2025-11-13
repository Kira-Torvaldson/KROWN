/**
 * Krown Agent - Daemon C pour gestion SSH
 * 
 * Ce daemon écoute sur un socket Unix local et répond aux commandes
 * du backend Node.js pour gérer les connexions SSH.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <signal.h>
#include <errno.h>
#include <pthread.h>
#include <stdbool.h>

#include "agent.h"
#include "ssh_handler.h"
#include "socket_server.h"
#include "request_handler.h"
#include <time.h>
#include <sys/stat.h>

// Variables globales
static volatile bool running = true;
static int server_fd = -1;

/**
 * Gestionnaire de signal pour arrêt propre
 */
void signal_handler(int sig) {
    if (sig == SIGINT || sig == SIGTERM) {
        printf("\n[Agent] Signal de terminaison reçu, arrêt en cours...\n");
        running = false;
        if (server_fd >= 0) {
            close(server_fd);
        }
    }
}

/**
 * Fonction principale
 */
int main(int argc, char *argv[]) {
    printf("=== Krown Agent v1.0 ===\n");
    printf("[Agent] Démarrage du daemon SSH...\n");

    // Enregistrer les gestionnaires de signaux
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // Initialiser le gestionnaire SSH
    if (ssh_handler_init() != 0) {
        fprintf(stderr, "[Agent] Erreur: Échec de l'initialisation SSH\n");
        return 1;
    }
    printf("[Agent] Gestionnaire SSH initialisé\n");

    // Démarrer le serveur socket Unix
    const char *socket_path = "/tmp/krown-agent.sock";
    if (argc > 1) {
        socket_path = argv[1];
    }

    printf("[Agent] Écoute sur socket: %s\n", socket_path);
    
    server_fd = socket_server_start(socket_path);
    if (server_fd < 0) {
        fprintf(stderr, "[Agent] Erreur: Impossible de démarrer le serveur socket\n");
        ssh_handler_cleanup();
        return 1;
    }

    printf("[Agent] Daemon prêt, en attente de commandes...\n");

    // Boucle principale
    while (running) {
        int client_fd = socket_server_accept(server_fd);
        if (client_fd < 0) {
            if (running) {
                perror("[Agent] Erreur accept");
            }
            continue;
        }

        // Traiter la requête dans un thread séparé
        pthread_t thread;
        int *client_ptr = malloc(sizeof(int));
        *client_ptr = client_fd;
        
        if (pthread_create(&thread, NULL, handle_client_request, client_ptr) != 0) {
            perror("[Agent] Erreur création thread");
            close(client_fd);
            free(client_ptr);
        } else {
            pthread_detach(thread);
        }
    }

    // Nettoyage
    printf("[Agent] Arrêt du daemon...\n");
    socket_server_stop(server_fd, socket_path);
    ssh_handler_cleanup();
    printf("[Agent] Arrêt terminé\n");

    return 0;
}

