export interface User {
  id: string
  username: string
  email?: string
  role: 'admin' | 'operator' | 'readonly'
}

export interface Server {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface Session {
  id: string
  user_id: string
  host: string
  port: number
  username: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  created_at: string
  updated_at: string
  closed_at?: string
}

export interface CommandExecution {
  id: string
  session_id: string
  command: string
  stdout: string
  stderr: string
  exit_code?: number
  executed_at: string
  duration_ms: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

/** Payload POST /api/sessions (snake_case côté fil JSON, aligné backend) */
/** POST /api/sessions — mot de passe et/ou clé (selon serveur SSH) */
export interface CreateSessionRequest {
  host: string
  port?: number
  username: string
  password?: string
  private_key?: string
  passphrase?: string
}

export interface ExecuteCommandRequest {
  command: string
  timeout_secs?: number
}

/** API REST serveurs : préférer auth_method + private_key si backend snake_case */
export interface CreateServerRequest {
  name: string
  host: string
  port?: number
  username: string
  /** Alias UI camelCase ; envoyer `key` pour auth par clé */
  authMethod?: 'password' | 'key'
  auth_method?: string
  password?: string
  private_key?: string
  passphrase?: string
}

export interface UpdateServerRequest {
  name?: string
  host?: string
  port?: number
  username?: string
  authMethod?: 'password' | 'key'
  auth_method?: string
  password?: string
  private_key?: string
  passphrase?: string
}

export interface WebSocketEvent {
  event: 'welcome' | 'authenticated' | 'subscribed' | 'output' | 'command_complete' | 'session_status' | 'error' | 'pong'
  payload?: unknown
  message?: string
  user_id?: string
  username?: string
  session_id?: string
  stream?: 'stdout' | 'stderr'
  data?: string
  exit_code?: number
  status?: string
}

