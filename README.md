# Krown - Gestionnaire de Sessions SSH

Système de gestion et supervision d'accès SSH avec interface web et API.

## 📋 Table des matières

- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Structure du projet](#structure-du-projet)
- [Utilisation](#utilisation)
- [Documentation technique](#documentation-technique)
- [Sécurité](#sécurité)
- [Dépannage](#dépannage)

## Architecture

Krown utilise une architecture hybride **C + Node.js** :

- **Agent C** (`krown-agent`) : Daemon bas niveau pour connexions SSH (libssh)
- **API Node.js** (`krown-api`) : Serveur REST + WebSocket pour orchestration
- **Frontend React** : Interface utilisateur web

```
┌─────────────────┐
│  Frontend React │
│   (Port 3000)   │
└────────┬────────┘
         │ HTTP/WebSocket
         ▼
┌─────────────────┐
│  krown-api      │
│  (Node.js)      │
│  Port 8080      │
└────────┬────────┘
         │ Socket Unix
         │ /tmp/krown-agent.sock
         ▼
┌─────────────────┐
│  krown-agent    │
│  (Daemon C)     │
│  libssh         │
└─────────────────┘
```

### Communication Agent ↔ API

L'agent C écoute sur un socket Unix (`/tmp/krown-agent.sock`) et utilise un protocole binaire simple :

**Commande (Client → Agent)** :
```
[Version: 4 bytes][Type: 4 bytes][Data Length: 4 bytes][Data: JSON]
```

**Réponse (Agent → Client)** :
```
[Version: 4 bytes][Code: 4 bytes][Data Length: 4 bytes][Data: JSON]
```

### Types de commandes

- `CMD_PING = 1` : Vérifier que l'agent est actif
- `CMD_SSH_CONNECT = 2` : Établir une connexion SSH
- `CMD_SSH_DISCONNECT = 3` : Fermer une connexion SSH
- `CMD_SSH_EXECUTE = 4` : Exécuter une commande sur une session SSH
- `CMD_SSH_STATUS = 5` : Obtenir le statut d'une session
- `CMD_LIST_SESSIONS = 6` : Lister toutes les sessions actives

## Prérequis

### Système

- **Linux** (Debian/Kali/Parrot)
- **GCC** et **Make**
- **Node.js** 18+
- **npm** 9+
- **libssh-dev** et **libjson-c-dev**

### Vérifier les versions

```bash
gcc --version      # Doit être >= 7.0
node --version     # Doit être >= 18.0
npm --version      # Doit être >= 9.0
```

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/Kira-Torvaldson/KROWN.git
cd KROWN
```

### 2. Installer les dépendances système

**Ubuntu/Debian/Kali :**

```bash
sudo apt-get update
sudo apt-get install -y \
    libssh-dev \
    libjson-c-dev \
    build-essential \
    nodejs \
    npm
```

### 3. Installer les dépendances du projet

Depuis la racine du projet :

```bash
# Installer npm-run-all (pour orchestrer les scripts)
npm install

# Installer toutes les dépendances (frontend + backend)
npm run install:all
```

### 4. Compiler l'agent C

```bash
cd agent
make deps    # Installe les dépendances manquantes (optionnel)
make         # Compile
```

Le binaire sera créé dans `agent/bin/krown-agent`

**Vérifier la compilation :**

```bash
./bin/krown-agent
```

Vous devriez voir :
```
=== Krown Agent v1.0 ===
[Agent] Démarrage du daemon SSH...
[Agent] Gestionnaire SSH initialisé
[Socket] Serveur démarré sur /tmp/krown-agent.sock
[Agent] Daemon prêt, en attente de commandes...
```

## Démarrage rapide

### Option A : Utiliser les scripts npm (recommandé)

Depuis la racine du projet :

```bash
# Mode développement (backend + frontend)
npm run dev
```

Cela démarre :
- **Agent C** : Démarré automatiquement par l'API si nécessaire
- **API Node.js** : `http://localhost:8080`
- **Frontend React** : `http://localhost:3000`

### Option B : Démarrer séparément

```bash
# Terminal 1 - Agent C
cd agent
./bin/krown-agent

# Terminal 2 - API Node.js
cd backend-node
npm start

# Terminal 3 - Frontend React (optionnel)
cd frontend
npm run dev
```

### Option C : L'API démarre l'agent automatiquement

L'API Node.js détecte si l'agent n'est pas disponible et tente de le démarrer.

```bash
cd backend-node
npm start
```

## Structure du projet

```
KROWN/
├── agent/                 # Daemon C
│   ├── src/
│   │   ├── main.c        # Point d'entrée
│   │   ├── socket_server.c  # Serveur socket Unix
│   │   ├── ssh_handler.c    # Gestion SSH (libssh)
│   │   └── request_handler.c # Traitement des requêtes
│   ├── build/            # Fichiers compilés (ignoré par Git)
│   ├── bin/              # Binaire final (ignoré par Git)
│   └── Makefile
│
├── backend-node/         # API Node.js
│   ├── server.js         # Serveur Express + Socket.io
│   ├── agent-client.js   # Client pour communiquer avec l'agent C
│   ├── test-agent.js     # Script de test
│   └── package.json
│
├── frontend/             # Frontend React
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── package.json          # Scripts npm racine
├── .gitignore
├── .editorconfig
└── README.md             # Ce fichier
```

## Utilisation

### API REST

#### Health check

```bash
curl http://localhost:8080/api/health
```

Réponse :
```json
{
  "status": "ok",
  "agent": {
    "status": "pong",
    "agent": "krown-agent v1.0"
  },
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

#### Ping l'agent

```bash
curl http://localhost:8080/api/ping
```

#### Créer une session SSH

```bash
curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "host": "example.com",
    "port": 22,
    "username": "user",
    "password": "pass"
  }'
```

Réponse :
```json
{
  "session_id": "session_0_1705056000",
  "status": "connected",
  "host": "example.com",
  "port": 22
}
```

#### Lister les sessions

```bash
curl http://localhost:8080/api/sessions
```

#### Obtenir le statut d'une session

```bash
curl http://localhost:8080/api/sessions/SESSION_ID
```

#### Fermer une session

```bash
curl -X DELETE http://localhost:8080/api/sessions/SESSION_ID
```

#### Exécuter une commande

```bash
curl -X POST http://localhost:8080/api/sessions/SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la"}'
```

Réponse :
```json
{
  "output": "total 24\ndrwxr-xr-x ...",
  "exit_code": 0,
  "bytes_read": 1234
}
```

### WebSocket

Le serveur expose un WebSocket sur `ws://localhost:8080` avec les événements :

- `welcome` - Message de bienvenue
- `session:connected` - Nouvelle session connectée
- `session:disconnected` - Session fermée
- `session:output` - Sortie d'une commande exécutée

#### Exemple JavaScript

```javascript
const socket = io('http://localhost:8080');

socket.on('welcome', (data) => {
    console.log('Connecté:', data);
});

socket.on('session:output', (data) => {
    console.log('Sortie:', data.output);
});

// S'abonner à une session
socket.emit('subscribe:session', 'session_123');
```

### Frontend React

Le frontend React est disponible sur `http://localhost:3000` après avoir lancé :

```bash
cd frontend
npm install
npm run dev
```

L'interface permet de :
- Gérer les serveurs SSH
- Créer et gérer des sessions SSH
- Exécuter des commandes via un terminal virtuel
- Consulter l'historique des sessions

## Documentation technique

### Scripts npm disponibles

Depuis la racine du projet :

| Commande | Description |
|----------|-------------|
| `npm install` | Installe npm-run-all |
| `npm run install:all` | Installe toutes les dépendances |
| `npm run install:backend` | Installe les dépendances du backend |
| `npm run install:frontend` | Installe les dépendances du frontend |
| `npm run dev` | Lance backend + frontend en mode dev |
| `npm run dev:backend` | Lance uniquement le backend |
| `npm run dev:frontend` | Lance uniquement le frontend |
| `npm run build` | Build pour production |
| `npm start` | Lance en mode production |

### Compilation de l'agent C

Le Makefile gère automatiquement la compilation :

```bash
cd agent
make           # Compile
make clean     # Nettoie les fichiers de build
make install   # Installe dans /usr/local/bin (optionnel)
make deps      # Installe les dépendances système (optionnel)
```

### Mode développement

**Agent C** (recompiler manuellement après modification) :

```bash
cd agent && make && ./bin/krown-agent
```

**API Node.js** (rechargement automatique) :

```bash
cd backend-node && npm run dev
```

**Frontend React** (rechargement automatique) :

```bash
cd frontend && npm run dev
```

### Test de l'agent

```bash
cd backend-node
node test-agent.js
```

Vous devriez voir :
```
=== Test Agent Client ===

1. Test Ping...
✓ Ping réussi: { status: 'pong', agent: 'krown-agent v1.0' }

2. Test Liste Sessions...
✓ Sessions: { sessions: [], count: 0 }

=== Tests terminés ===
```

## Sécurité

⚠️ **Note** : Cette version est un PoC. Pour la production :

- Chiffrer les communications socket Unix
- Implémenter l'authentification utilisateur
- Valider et sanitizer toutes les entrées
- Utiliser des tokens d'authentification
- Limiter les permissions du socket Unix (actuellement 0666)
- Ne pas exposer l'agent directement sur le réseau
- Utiliser HTTPS pour l'API en production
- Ne jamais stocker les mots de passe en clair
- Implémenter un système de rotation des clés SSH

## Dépannage

### Erreur : "libssh.h: No such file or directory"

```bash
sudo apt-get install libssh-dev
```

### Erreur : "json-c/json.h: No such file or directory"

```bash
sudo apt-get install libjson-c-dev
```

### Erreur : "krown-agent.sock: Address already in use"

```bash
rm /tmp/krown-agent.sock
# Puis redémarrer l'agent
```

### L'API ne peut pas communiquer avec l'agent

1. Vérifier que l'agent est démarré : `ps aux | grep krown-agent`
2. Vérifier que le socket existe : `ls -l /tmp/krown-agent.sock`
3. Vérifier les permissions : `chmod 666 /tmp/krown-agent.sock`
4. Tester manuellement : `cd backend-node && node test-agent.js`

### L'agent ne démarre pas

```bash
# Vérifier que le socket n'est pas déjà utilisé
ls -l /tmp/krown-agent.sock

# Vérifier les permissions
chmod 666 /tmp/krown-agent.sock

# Vérifier les dépendances
ldd agent/bin/krown-agent
```

### Le frontend ne se connecte pas au backend

1. Vérifier que le backend est démarré : `curl http://localhost:8080/api/health`
2. Vérifier l'URL dans `frontend/vite.config.ts`
3. Vérifier les CORS dans `backend-node/server.js`
4. Vérifier la console du navigateur pour les erreurs

### Erreurs de compilation de l'agent

```bash
# Installer les dépendances manquantes
sudo apt-get install libssh-dev libjson-c-dev build-essential

# Nettoyer et recompiler
cd agent
make clean
make
```

## Installation en production

### Compiler et installer l'agent

```bash
cd agent
make
sudo make install  # Installe dans /usr/local/bin
```

### Créer un service systemd (optionnel)

Créez `/etc/systemd/system/krown-agent.service` :

```ini
[Unit]
Description=Krown SSH Agent
After=network.target

[Service]
Type=simple
User=krown
ExecStart=/usr/local/bin/krown-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl enable krown-agent
sudo systemctl start krown-agent
```

### Variables d'environnement

Pour l'API Node.js, vous pouvez définir :

```bash
export PORT=8080
export AGENT_SOCKET=/tmp/krown-agent.sock
```

## Conteneurisation (Futur)

L'architecture est préparée pour Docker :

- **Agent C** : Image basée sur Debian avec libssh
- **API Node.js** : Image Node.js Alpine
- **Frontend** : Image Nginx pour servir les fichiers statiques

## Développement

### Workflow recommandé

1. **Développement de l'agent C** :
   ```bash
   cd agent
   # Modifier le code
   make && ./bin/krown-agent
   ```

2. **Développement de l'API** :
   ```bash
   cd backend-node
   npm run dev  # Rechargement automatique
   ```

3. **Développement du frontend** :
   ```bash
   cd frontend
   npm run dev  # Rechargement automatique avec HMR
   ```

### Tests

```bash
# Tester l'agent
cd backend-node && node test-agent.js

# Tester l'API
curl http://localhost:8080/api/health
```

## License

GPL-3.0

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.
