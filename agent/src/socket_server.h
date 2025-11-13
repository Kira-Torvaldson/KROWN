#ifndef SOCKET_SERVER_H
#define SOCKET_SERVER_H

#include "agent.h"

int socket_server_start(const char *socket_path);
int socket_server_accept(int server_fd);
int socket_read_command(int client_fd, command_t **cmd_out);
int socket_send_response(int client_fd, response_code_t code, const char *data);
void socket_server_stop(int server_fd, const char *socket_path);

#endif // SOCKET_SERVER_H

