#ifndef SSH_HANDLER_H
#define SSH_HANDLER_H

#include "agent.h"

int ssh_handler_init(void);
void ssh_handler_cleanup(void);

response_code_t handle_ssh_connect(const char *json_data, char **response);
response_code_t handle_ssh_disconnect(const char *json_data, char **response);
response_code_t handle_ssh_execute(const char *json_data, char **response);
response_code_t handle_ssh_status(const char *json_data, char **response);
response_code_t handle_list_sessions(char **response);
response_code_t handle_ssh_shell_start(const char *json_data, char **response);
response_code_t handle_ssh_shell_write(const char *json_data, char **response);
response_code_t handle_ssh_shell_read(const char *json_data, char **response);
response_code_t handle_ssh_shell_resize(const char *json_data, char **response);
response_code_t handle_ssh_shell_close(const char *json_data, char **response);

#endif // SSH_HANDLER_H

