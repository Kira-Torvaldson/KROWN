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
#include <time.h>
#include <sys/stat.h>

#include "agent.h"
#include "ssh_handler.h"
#include "socket_server.h"
#include "request_handler.h"

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
    // Utiliser la variable d'environnement ou l'argument, sinon défaut
    const char *socket_path = getenv("SOCKET_PATH");
    if (!socket_path) {
        socket_path = "/tmp/krown-agent.sock";
    }
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

    // Boucle principale avec select() pour éviter les appels accept() inutiles
    while (running) {
        fd_set read_fds;
        struct timeval timeout;
        
        FD_ZERO(&read_fds);
        FD_SET(server_fd, &read_fds);
        
        // Timeout de 1 seconde pour permettre la vérification de 'running'
        timeout.tv_sec = 1;
        timeout.tv_usec = 0;
        
        int select_result = select(server_fd + 1, &read_fds, NULL, NULL, &timeout);
        
        if (select_result < 0) {
            if (errno == EINTR) {
                // Interruption par signal, continuer
                continue;
            }
            if (running) {
                perror("[Agent] Erreur select");
            }
            continue;
        }
        
        if (select_result == 0) {
            // Timeout - pas de connexion en attente, continuer la boucle
            continue;
        }
        
        // Une connexion est en attente
        int client_fd = socket_server_accept(server_fd);
        if (client_fd < 0) {
            // EAGAIN/EWOULDBLOCK ne devrait plus se produire avec select()
            // mais on gère quand même
            if (errno != EAGAIN && errno != EWOULDBLOCK && running) {
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

