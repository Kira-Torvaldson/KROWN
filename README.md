# Krown - Gestionnaire de Sessions SSH

Système de gestion et supervision d'accès SSH avec interface web moderne et API REST.

## 🚀 Démarrage rapide

### Avec Docker (Recommandé)

```bash
# 1. Cloner le projet
git clone https://github.com/Kira-Torvaldson/KROWN.git
cd KROWN

# 2. Générer les certificats SSL (première fois)
cd backend-node && chmod +x generate-certs.sh && ./generate-certs.sh && cd ..

# 3. Démarrer tous les services
docker compose up --build
```

**Accès :**
- Frontend : http://localhost:3000 (HTTP) ou https://localhost:3443 (HTTPS)
- Backend API : http://localhost:8080 (HTTP) ou https://localhost:8443 (HTTPS)

## 📋 Table des matières

- [Architecture](#architecture)
- [Installation](#installation)
  - [Docker (Recommandé)](#installation-docker)
  - [Installation manuelle](#installation-manuelle)
- [Configuration](#configuration)
  - [HTTPS](#configuration-https)
  - [Variables d'environnement](#variables-denvironnement)
- [Utilisation](#utilisation)
  - [API REST](#api-rest)
  - [WebSocket](#websocket)
  - [Interface Web](#interface-web)
- [Développement](#développement)
- [Dépannage](#dépannage)
- [Sécurité](#sécurité)
- [Contribution](#contribution)
- [License](#license)

## Architecture

Krown utilise une architecture hybride **C + Node.js** pour combiner performance et facilité de développement :

```
┌─────────────────┐
│  Frontend React │  ← Interface utilisateur (Port 3000/3443)
│   (Nginx)       │
└────────┬────────┘
         │ HTTP/HTTPS + WebSocket
         ▼
┌─────────────────┐
│  krown-api      │  ← API REST + WebSocket (Port 8080/8443)
│  (Node.js)      │
└────────┬────────┘
         │ Socket Unix
         │ /tmp/krown-agent.sock
         ▼
┌─────────────────┐
│  krown-agent    │  ← Daemon SSH bas niveau (libssh)
│  (Daemon C)     │
└─────────────────┘
```

### Composants

- **Agent C** (`krown-agent`) : Daemon bas niveau gérant les connexions SSH via libssh
- **API Node.js** (`krown-api`) : Serveur Express avec Socket.io pour orchestration
- **Frontend React** : Interface web moderne avec terminal virtuel (xterm.js)

### Communication Agent ↔ API

L'agent C écoute sur un socket Unix (`/tmp/krown-agent.sock`) avec un protocole binaire :

**Important : agent local uniquement**

- `krown-agent` tourne **localement** (ou dans un conteneur Docker) à côté de `krown-api`.
- Il **ne s'installe pas** sur la machine SSH distante. La machine distante n'expose que SSH.

**Format de commande** :
```
[Version: 4 bytes][Type: 4 bytes][Data Length: 4 bytes][Data: JSON]
```

**Format de réponse** :
```
[Version: 4 bytes][Code: 4 bytes][Data Length: 4 bytes][Data: JSON]
```

**Commandes disponibles** :
- `CMD_PING = 1` : Vérifier que l'agent est actif
- `CMD_SSH_CONNECT = 2` : Établir une connexion SSH
- `CMD_SSH_DISCONNECT = 3` : Fermer une connexion SSH
- `CMD_SSH_EXECUTE = 4` : Exécuter une commande sur une session SSH
- `CMD_SSH_STATUS = 5` : Obtenir le statut d'une session
- `CMD_LIST_SESSIONS = 6` : Lister toutes les sessions actives

## Installation

### Installation Docker ⭐

**Recommandé** : Docker simplifie le déploiement et évite les problèmes de dépendances.

#### Prérequis

- **Docker** 20.10+
- **Docker Compose** 2.0+

```bash
# Installer Docker (Linux)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Installer Docker Compose
sudo apt-get install docker-compose-plugin

# Vérifier
docker --version
docker compose version
```

#### Démarrage

```bash
# 1. Cloner le projet
git clone https://github.com/Kira-Torvaldson/KROWN.git
cd KROWN

# 2. Générer les certificats SSL (première fois uniquement)
cd backend-node
chmod +x generate-certs.sh
./generate-certs.sh
cd ..

# 3. Démarrer tous les services
docker compose up --build
```

#### Commandes utiles

```bash
# Lancer en arrière-plan
docker compose up -d --build

# Voir les logs
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f agent
docker compose logs -f backend
docker compose logs -f frontend

# Arrêter
docker compose down

# Rebuild un service
docker compose build --no-cache agent
docker compose up -d agent

# Nettoyer complètement
docker compose down -v --rmi all
```

#### Avantages Docker

✅ Pas besoin d'installer libssh-dev, libjson-c-dev, Node.js, etc.  
✅ Environnement reproductible  
✅ Déploiement en une commande  
✅ Isolation des composants  
✅ Versions contrôlées des dépendances

### Installation manuelle

#### Prérequis système

- **Linux** (Debian/Kali/Parrot)
- **GCC** 7.0+ et **Make**
- **Node.js** 20.19+ ou 22.12+ (ou 18.x avec Vite 5.x)
- **npm** 9+
- **libssh-dev** et **libjson-c-dev**

#### Installation

```bash
# 1. Cloner le projet
git clone https://github.com/Kira-Torvaldson/KROWN.git
cd KROWN

# 2. Installer les dépendances système
sudo apt-get update
sudo apt-get install -y \
    libssh-dev \
    libjson-c-dev \
    build-essential \
    nodejs \
    npm

# 3. Installer les dépendances du projet
npm install
npm run install:all

# 4. Compiler l'agent C
cd agent
make deps    # Optionnel : installe les dépendances manquantes
make         # Compile

# 5. Vérifier la compilation
./bin/krown-agent
```

#### Démarrage

**Option A : Scripts npm (recommandé)**
```bash
npm run dev  # Démarre backend + frontend (installe auto les dépendances manquantes)
```

**Option B : Démarrer séparément**
```bash
# Terminal 1 - Agent C
cd agent && ./bin/krown-agent

# Terminal 2 - API Node.js
cd backend-node && npm start

# Terminal 3 - Frontend React
cd frontend && npm run dev
```

## Configuration

### Configuration HTTPS

#### Génération des certificats (développement)

```bash
cd backend-node
chmod +x generate-certs.sh
./generate-certs.sh
```

Ou manuellement :
```bash
cd backend-node
mkdir -p certs

openssl req -x509 -newkey rsa:4096 \
    -nodes \
    -keyout certs/key.pem \
    -out certs/cert.pem \
    -days 365 \
    -subj "/C=FR/ST=State/L=City/O=Krown/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
```

#### Production avec Let's Encrypt

```bash
# Installer certbot
sudo apt-get install certbot

# Générer les certificats
sudo certbot certonly --standalone -d votre-domaine.com

# Modifier docker-compose.yml pour monter les certificats
```

#### Comportement automatique

- **Avec certificats** : HTTPS activé automatiquement
- **Sans certificats** : HTTP avec avertissement
- **Forcer HTTP** : `USE_HTTP_ONLY=true`

### Variables d'environnement

#### Backend Node.js

```bash
PORT=8080                    # Port HTTP
HTTPS_PORT=8443             # Port HTTPS
AGENT_SOCKET=/tmp/krown-agent.sock  # Socket Unix de l'agent
USE_HTTPS=true              # Activer HTTPS
DOCKER=true                 # Mode Docker
NODE_ENV=production         # Environnement
```

#### Frontend React

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=localhost:8080
```

#### Agent C

```bash
SOCKET_PATH=/tmp/krown-agent.sock  # Chemin du socket Unix
```

## Utilisation

### API REST

#### Health Check

```bash
curl http://localhost:8080/api/health
```

**Réponse :**
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

#### Ping Agent

```bash
curl http://localhost:8080/api/ping
```

#### Créer une session SSH (mot de passe et/ou clé)

L’API accepte **`password`**, **`private_key`** (+ `passphrase` si besoin), ou **les deux** : l’agent tente d’abord la clé inline si fournie, puis le mot de passe si l’auth n’a pas réussi. Sans les deux, l’agent peut utiliser **publickey_auto** (ssh-agent / clés locales).

**Exemple avec clé SSH privée :**
```bash
curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "host": "example.com",
    "port": 22,
    "username": "user",
    "private_key": "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
  }'
```

**Réponse :**
```json
{
  "id": "session_0_1705056000",
  "user_id": "system",
  "host": "example.com",
  "port": 22,
  "username": "user",
  "status": "connected",
  "created_at": "2025-01-12T10:30:00.000Z",
  "updated_at": "2025-01-12T10:30:00.000Z"
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
  -d '{"command": "whoami"}'
```

**Réponse :**
```json
{
  "output": "user\n",
  "stderr": "",
  "exit_code": 0,
  "bytes_stdout": 5,
  "bytes_stderr": 0,
  "pty_used": false
}
```

#### Exécuter une commande avec PTY (pseudo-terminal)

Certaines commandes nécessitent un pseudo-terminal (ex: environnements configurés avec `requiretty`, ou commandes interactives).
Dans ce cas, utilisez `request_pty: true`.

```bash
curl -X POST http://localhost:8080/api/sessions/SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "sudo -n whoami", "request_pty": true}'
```

**Réponse (exemple) :**
```json
{
  "output": "root\n",
  "stderr": "",
  "exit_code": 0,
  "bytes_stdout": 5,
  "bytes_stderr": 0,
  "pty_used": true
}
```

#### Récupérer les logs

**Logs de l'agent :**
```bash
curl http://localhost:8080/api/logs/agent?lines=100
```

**Logs du backend :**
```bash
curl http://localhost:8080/api/logs/backend?lines=100
```

**Tous les logs :**
```bash
curl http://localhost:8080/api/logs?lines=100
```

**Réponse :**
```json
{
  "agent": {
    "source": "docker",
    "container": "krown-agent",
    "lines": 100,
    "logs": ["[Agent] Démarrage...", "..."]
  },
  "backend": {
    "source": "docker",
    "container": "krown-api",
    "lines": 100,
    "logs": ["[API] Serveur démarré...", "..."]
  },
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

### WebSocket

Le serveur expose un WebSocket sur `ws://localhost:8080` (ou `wss://localhost:8443` en HTTPS).

#### Terminal interactif (PTY full-duplex)

Après `POST /api/sessions`, le frontend ouvre un WebSocket dédié :

`ws://<host>:<port>/api/ssh/<SESSION_ID>/stream`

1. Client envoie `{"type":"init","cols":80,"rows":24}` → ouverture shell distant (agent).
2. Serveur répond `{"event":"shell_ready"}` puis des `{"event":"pty","data":"<base64>"}`.
3. Client envoie `{"type":"input","data":"..."}` (frappe clavier) et `{"type":"resize","cols":n,"rows":m}`.
4. Erreurs : `{"event":"error","message":"...","stage":"..."}` (ex. `agent_unavailable`, `ssh_shell_start` / codes agent mappés).

#### Socket.IO (événements généraux)

- `welcome` : Message de bienvenue avec statut de l'agent
- `session:connected` : Nouvelle session SSH connectée
- `session:disconnected` : Session SSH fermée
- `session:output` : Sortie d'une commande exécutée via REST `/execute`

#### Exemple JavaScript

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:8080');

socket.on('welcome', (data) => {
    console.log('Connecté:', data);
});

socket.on('session:connected', (session) => {
    console.log('Nouvelle session:', session);
});

socket.on('session:output', (data) => {
    console.log('Sortie:', data.output);
});

// S'abonner à une session
socket.emit('subscribe:session', 'session_123');
```

### Interface Web

Le frontend React est disponible sur `http://localhost:3000` (ou `https://localhost:3443` en HTTPS).

#### Fonctionnalités

- **Gestion des serveurs SSH** : Ajouter, modifier, supprimer des serveurs
- **Authentification** : Mot de passe SSH et/ou clé privée (`POST /api/sessions`)
- **Sessions SSH** : Connexion en un clic
- **Terminal interactif** : Shell PTY distant via WebSocket (`/api/ssh/:id/stream`) + xterm.js
- **REST execute** : Commandes ponctuelles avec sortie `output` / `stderr` (mappée `stdout` côté client)
- **Historique** : Consultation des sessions et commandes exécutées
- **Logs système** : Visualisation des logs de l'application

#### Technologies

- **React 18** avec TypeScript
- **Vite** pour le build
- **React Router** pour la navigation
- **Axios** pour les requêtes API
- **xterm.js** pour le terminal virtuel
- **WebSocket natif** pour la communication temps réel
- **Context API** pour le state management

## Développement

### Scripts npm

| Commande | Description |
|----------|-------------|
| `npm install` | Installe les dépendances racine et déclenche l'installation backend/frontend |
| `npm run install:all` | Installe toutes les dépendances |
| `npm run install:backend` | Installe les dépendances du backend |
| `npm run install:frontend` | Installe les dépendances du frontend |
| `npm run dev` | Lance backend + frontend en mode dev (auto-install si nécessaire) |
| `npm run dev:backend` | Lance uniquement le backend |
| `npm run dev:frontend` | Lance uniquement le frontend |
| `npm run build` | Build pour production |
| `npm start` | Lance en mode production (auto-install si nécessaire) |

### Compilation de l'agent C

```bash
cd agent
make           # Compile
make clean     # Nettoie les fichiers de build
make install   # Installe dans /usr/local/bin (optionnel)
make deps      # Installe les dépendances système (optionnel)
```

### Test de l'agent

```bash
cd backend-node
node test-agent.js
```

## Dépannage

### Erreur : "Cannot find package 'express'"

Les dépendances npm du backend n'ont pas été installées.

**Solution :**
```bash
cd backend-node
npm install
```

### Erreur : "Vite requires Node.js version 20.19+"

Vous utilisez Node.js 18.x mais Vite 7.x nécessite Node.js 20.19+.

**Solution :**
```bash
# Mettre à jour Node.js
nvm install 22
nvm use 22

# Ou utiliser Vite 5.x (compatible Node.js 18)
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Erreur : "libssh.h: No such file or directory"

```bash
sudo apt-get install libssh-dev
```

### Erreur : "json-c/json.h: No such file or directory"

```bash
sudo apt-get install libjson-c-dev
```

### Erreur 500 lors de la création d'une session SSH

**1. Vérifier les logs :**
```bash
# Docker
docker compose logs -f backend
docker compose logs -f agent

# Sans Docker
# Les logs s'affichent dans la console
```

**2. Vérifier que l'agent est démarré :**
```bash
# Docker
docker compose ps agent

# Sans Docker
ps aux | grep krown-agent
ls -l /tmp/krown-agent.sock
```

**3. Tester la communication :**
```bash
cd backend-node
node test-agent.js
```

**4. Causes courantes :**
- Agent non démarré → Démarrer l'agent
- Erreur de connexion SSH → Vérifier host/port/credentials
- Erreur d'authentification → Vérifier la clé SSH (authorized_keys, permissions, passphrase)
- Timeout → L'agent est bloqué ou ne répond pas

### Erreur : "Resource temporarily unavailable" (Agent)

L'agent affiche des erreurs EAGAIN en boucle. Ce problème a été corrigé avec l'utilisation de `select()`.

**Solution :**
```bash
# Reconstruire l'agent
docker compose build --no-cache agent
docker compose up -d agent
```

### Erreur : "Échec authentification SSH"

**Vérifier les logs de l'agent :**
```bash
docker compose logs agent | grep SSH
```

Les logs affichent notamment :
- Présence ou non des identifiants (mot de passe / clé), **sans jamais les valeurs**
- Les méthodes disponibles sur le serveur SSH
- Le code d'erreur d'authentification

**Causes possibles :**
- Mot de passe incorrect
- Clé SSH non autorisée sur le serveur
- Format de clé invalide
- Serveur SSH n'accepte pas la méthode choisie

### Les conteneurs Docker ne démarrent pas

```bash
# Voir les logs
docker compose logs

# Vérifier les conteneurs
docker compose ps

# Rebuild depuis zéro
docker compose down -v
docker compose build --no-cache
docker compose up
```

### Le frontend ne peut pas charger les certificats SSL

Le frontend essaie de charger HTTPS mais les certificats sont absents.

**Solution :**
- Générer les certificats : `cd backend-node && ./generate-certs.sh`
- Ou désactiver HTTPS : `USE_HTTPS=false` dans `docker-compose.yml`

## Sécurité

⚠️ **Note importante** : Cette version est un PoC. Pour la production :

- ✅ Chiffrer les communications socket Unix
- ✅ Implémenter l'authentification utilisateur
- ✅ Valider et sanitizer toutes les entrées
- ✅ Utiliser des tokens d'authentification
- ✅ Limiter les permissions du socket Unix (actuellement 0666)
- ✅ Ne pas exposer l'agent directement sur le réseau
- ✅ Utiliser HTTPS pour l'API en production
- ✅ Ne jamais stocker les mots de passe en clair
- ✅ Implémenter un système de rotation des clés SSH
- ✅ Utiliser des certificats SSL signés par une CA (Let's Encrypt)

## Structure du projet

```
KROWN/
├── agent/                 # Daemon C
│   ├── src/
│   │   ├── main.c        # Point d'entrée
│   │   ├── socket_server.c  # Serveur socket Unix
│   │   ├── ssh_handler.c    # Gestion SSH (libssh)
│   │   └── request_handler.c # Traitement des requêtes
│   ├── build/            # Fichiers compilés
│   ├── bin/              # Binaire final
│   ├── Makefile
│   └── Dockerfile
│
├── backend-node/         # API Node.js
│   ├── server.js         # Serveur Express + Socket.io
│   ├── agent-client.js   # Client pour l'agent C
│   ├── https-server.js   # Configuration HTTPS
│   ├── generate-certs.sh # Script génération certificats
│   ├── test-agent.js     # Script de test
│   ├── certs/            # Certificats SSL
│   ├── package.json
│   └── Dockerfile
│
├── frontend/             # Frontend React
│   ├── src/
│   │   ├── pages/        # Pages de l'application
│   │   ├── components/   # Composants réutilisables
│   │   ├── services/     # Services API et WebSocket
│   │   └── types/        # Types TypeScript
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docker-compose.yml    # Configuration Docker
├── package.json          # Scripts npm racine
└── README.md             # Ce fichier
```

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## License

MIT - Voir [LICENSE](LICENSE) pour plus de détails.
