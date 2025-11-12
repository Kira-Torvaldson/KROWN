# Communication Backend ↔ Frontend - Krown

Documentation de la communication REST + WebSocket entre le backend Rust et le frontend React.

## Architecture de Communication

```
Frontend (React)          Backend (Rust)
     |                          |
     |--- REST API ------------|
     |                          |
     |--- WebSocket ------------|
     |                          |
```

## Endpoints REST

### Authentification

#### POST /api/auth/login
**Request:**
```json
{
  "username": "user",
  "password": "password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "user",
    "email": "user@example.com",
    "role": "operator"
  }
}
```

#### POST /api/auth/register
**Request:**
```json
{
  "username": "user",
  "password": "password",
  "email": "user@example.com",
  "role": "operator"
}
```

### Serveurs (CRUD)

#### GET /api/servers
Liste tous les serveurs de l'utilisateur connecté.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Mon Serveur",
    "host": "example.com",
    "port": 22,
    "username": "user",
    "auth_method": "password",
    "created_at": "2025-01-12T10:00:00Z",
    "updated_at": "2025-01-12T10:00:00Z"
  }
]
```

#### POST /api/servers
Crée un nouveau serveur.

**Request:**
```json
{
  "name": "Mon Serveur",
  "host": "example.com",
  "port": 22,
  "username": "user",
  "auth_method": "password",
  "password": "secret",
  "private_key": null,
  "passphrase": null
}
```

#### GET /api/servers/:id
Récupère un serveur spécifique.

#### PUT /api/servers/:id
Met à jour un serveur.

**Request:**
```json
{
  "name": "Nouveau Nom",
  "host": "new.example.com"
}
```

#### DELETE /api/servers/:id
Supprime un serveur.

### Sessions SSH

#### POST /api/ssh/:server_id/connect
Crée une session SSH à partir d'un serveur enregistré.

**Response:**
```json
{
  "id": "session-uuid",
  "user_id": "uuid",
  "host": "example.com",
  "port": 22,
  "username": "user",
  "status": "connected",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z"
}
```

#### GET /api/sessions
Liste toutes les sessions de l'utilisateur.

#### GET /api/sessions/:id
Récupère une session spécifique.

#### DELETE /api/sessions/:id
Ferme une session SSH.

#### POST /api/sessions/:id/execute
Exécute une commande sur une session.

**Request:**
```json
{
  "command": "ls -la",
  "timeout_secs": 30
}
```

**Response:**
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "command": "ls -la",
  "stdout": "total 24\ndrwxr-xr-x...",
  "stderr": "",
  "exit_code": 0,
  "executed_at": "2025-01-12T10:00:00Z",
  "duration_ms": 150
}
```

#### GET /api/sessions/:id/history
Récupère l'historique des commandes d'une session.

**Response:**
```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "command": "ls -la",
    "stdout": "...",
    "stderr": "",
    "exit_code": 0,
    "executed_at": "2025-01-12T10:00:00Z",
    "duration_ms": 150
  }
]
```

## WebSocket

### Connexion Générale

**URL:** `ws://localhost:8080/ws`

**Authentification:**
```json
{
  "type": "authenticate",
  "token": "jwt-token"
}
```

**Response:**
```json
{
  "event": "authenticated",
  "payload": {
    "user_id": "uuid",
    "username": "user"
  }
}
```

### Streaming SSH

**URL:** `ws://localhost:8080/api/ssh/:session_id/stream`

**Format des Messages:**

Tous les messages suivent le format :
```json
{
  "event": "event_type",
  "payload": { ... }
}
```

#### Événements

**1. Welcome**
```json
{
  "event": "welcome",
  "payload": {
    "message": "Connected to stream for session {id}"
  }
}
```

**2. Output (stdout/stderr)**
```json
{
  "event": "output",
  "payload": {
    "session_id": "uuid",
    "stream": "stdout",
    "data": "Hello World\n"
  }
}
```

**3. Command Complete**
```json
{
  "event": "command_complete",
  "payload": {
    "session_id": "uuid",
    "exit_code": 0
  }
}
```

**4. Session Status**
```json
{
  "event": "session_status",
  "payload": {
    "session_id": "uuid",
    "status": "connected"
  }
}
```

**5. Error**
```json
{
  "event": "error",
  "payload": {
    "message": "Error message"
  }
}
```

### Envoi de Commandes

Pour exécuter une commande via WebSocket :

```json
{
  "command": "ls -la"
}
```

Le backend exécutera la commande et enverra les événements `output` et `command_complete`.

## Exemple d'Utilisation Frontend

### Connexion REST

```typescript
import { apiService } from './services/api'

// Login
const response = await apiService.login('user', 'password')
localStorage.setItem('token', response.token)

// Créer un serveur
const server = await apiService.createServer({
  name: 'Mon Serveur',
  host: 'example.com',
  port: 22,
  username: 'user',
  auth_method: 'password',
  password: 'secret'
})

// Se connecter à un serveur
const session = await apiService.connectSsh(server.id)
```

### Connexion WebSocket Streaming

```typescript
import { wsService } from './services/websocket'

// Connecter au stream
wsService.connectStream(sessionId, token)

// Écouter les événements
wsService.on('output', (message) => {
  const { stream, data } = message.payload || message
  if (stream === 'stdout') {
    terminal.write(data)
  } else {
    terminal.write(`\x1b[31m${data}\x1b[0m`) // Rouge pour stderr
  }
})

wsService.on('command_complete', (message) => {
  const { exit_code } = message.payload || message
  terminal.write(`\r\n[Exit code: ${exit_code}]\r\n`)
})

// Envoyer une commande
wsService.sendStreamCommand('ls -la')
```

## Gestion d'Erreurs

### REST API

Les erreurs sont retournées avec les codes HTTP standards :
- `400` : Bad Request (données invalides)
- `401` : Unauthorized (token invalide/expiré)
- `403` : Forbidden (permission refusée)
- `404` : Not Found (ressource introuvable)
- `500` : Internal Server Error

**Format d'erreur:**
```json
{
  "error": "Error message"
}
```

### WebSocket

Les erreurs sont envoyées via l'événement `error` :
```json
{
  "event": "error",
  "payload": {
    "message": "Error description"
  }
}
```

## Sécurité

1. **Authentification JWT** : Tous les endpoints REST (sauf login/register) nécessitent un token JWT dans le header `Authorization: Bearer <token>`

2. **Isolation des données** : Les utilisateurs ne peuvent accéder qu'à leurs propres serveurs et sessions

3. **Validation** : Toutes les entrées sont validées côté backend

4. **HTTPS/WSS** : En production, utiliser HTTPS pour REST et WSS pour WebSocket

## Performance

- **WebSocket** : Connexion persistante pour le streaming temps réel
- **REST** : Pour les opérations CRUD et les requêtes ponctuelles
- **Reconnexion automatique** : Le frontend reconnecte automatiquement en cas de déconnexion WebSocket

## Exemple Complet

### Scénario : Connexion et Exécution de Commande

1. **Login (REST)**
```typescript
const { token } = await apiService.login('user', 'pass')
```

2. **Créer un serveur (REST)**
```typescript
const server = await apiService.createServer({ ... })
```

3. **Se connecter (REST)**
```typescript
const session = await apiService.connectSsh(server.id)
```

4. **Streaming WebSocket**
```typescript
wsService.connectStream(session.id, token)
wsService.on('output', (msg) => terminal.write(msg.payload.data))
wsService.sendStreamCommand('ls -la')
```

5. **Fermer la session (REST)**
```typescript
await apiService.deleteSession(session.id)
```

