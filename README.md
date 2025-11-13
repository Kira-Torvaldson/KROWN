# Krown - Gestionnaire de Sessions SSH

Système de gestion et supervision d'accès SSH avec interface web et API.

## 📋 Table des matières

- [Architecture](#architecture)
- [Installation rapide avec Docker](#installation-rapide-avec-docker) ⭐ **Recommandé**
- [Installation manuelle](#installation-manuelle)
- [Configuration HTTPS](#configuration-https)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [Développement](#développement)
- [Déploiement en production](#déploiement-en-production)
- [Dépannage](#dépannage)
- [Sécurité](#sécurité)
- [License](#license)

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

## Installation rapide avec Docker ⭐

**Recommandé** : Docker simplifie grandement le déploiement en évitant tous les problèmes de dépendances.

### Prérequis Docker

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

### Démarrage en une commande

```bash
# 1. Générer les certificats SSL (première fois uniquement)
cd backend-node
chmod +x generate-certs.sh
./generate-certs.sh
cd ..

# 2. Démarrer tous les services
docker compose up --build
```

Cela démarre automatiquement :
- **Agent C** : Daemon SSH
- **Backend Node.js** : 
  - HTTP sur `http://localhost:8080`
  - HTTPS sur `https://localhost:8443`
- **Frontend React** : 
  - HTTP sur `http://localhost:3000` (redirige vers HTTPS)
  - HTTPS sur `https://localhost:3443`

### Commandes Docker utiles

```bash
# Lancer en arrière-plan
docker compose up -d --build

# Voir les logs
docker compose logs -f

# Voir les logs d'un service spécifique
docker compose logs -f agent
docker compose logs -f backend
docker compose logs -f frontend

# Arrêter
docker compose down

# Rebuild un service spécifique
docker compose build --no-cache agent
docker compose up -d agent

# Nettoyer complètement
docker compose down -v --rmi all
```

### Avantages Docker

✅ **Pas besoin d'installer** libssh-dev, libjson-c-dev, Node.js, etc.  
✅ **Environnement reproductible** - fonctionne partout où Docker tourne  
✅ **Déploiement simple** - une seule commande : `docker compose up`  
✅ **Isolation** - chaque composant dans son propre conteneur  
✅ **Gestion des versions** - Node.js, libssh, etc. versionnés dans les images  

### Mode développement avec Docker

Créez `docker-compose.dev.yml` pour le hot-reload :

```yaml
version: '3.8'

services:
  backend:
    volumes:
      - ./backend-node:/app
      - /app/node_modules
    command: npm run dev
    environment:
      - NODE_ENV=development

  frontend:
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
```

Puis :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Installation manuelle

### Prérequis

#### Système

- **Linux** (Debian/Kali/Parrot)
- **GCC** et **Make**
- **Node.js** 20.19+ ou 22.12+ (ou 18.x avec Vite 5.x)
- **npm** 9+
- **libssh-dev** et **libjson-c-dev**

#### Vérifier les versions

```bash
gcc --version      # Doit être >= 7.0
node --version     # Doit être >= 20.19 ou 22.12 (ou 18.x avec Vite 5.x)
npm --version      # Doit être >= 9.0
```

### Installation

#### 1. Cloner le projet

```bash
git clone https://github.com/Kira-Torvaldson/KROWN.git
cd KROWN
```

#### 2. Installer les dépendances système

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

#### 3. Installer les dépendances du projet

Depuis la racine du projet :

```bash
# Installer npm-run-all (pour orchestrer les scripts)
npm install

# Installer toutes les dépendances (frontend + backend)
npm run install:all
```

#### 4. Compiler l'agent C

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

### Démarrage rapide

#### Option A : Utiliser les scripts npm (recommandé)

Depuis la racine du projet :

```bash
# Mode développement (backend + frontend)
npm run dev
```

Cela démarre :
- **Agent C** : Démarré automatiquement par l'API si nécessaire
- **API Node.js** : `http://localhost:8080`
- **Frontend React** : `http://localhost:3000`

#### Option B : Démarrer séparément

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

#### Option C : L'API démarre l'agent automatiquement

L'API Node.js détecte si l'agent n'est pas disponible et tente de le démarrer.

```bash
cd backend-node
npm start
```

## Configuration HTTPS

### Génération des certificats SSL

#### Pour le développement (certificats auto-signés)

```bash
# Depuis backend-node/
cd backend-node
mkdir -p certs
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

#### Pour la production (Let's Encrypt)

```bash
# Installer certbot
sudo apt-get install certbot

# Générer les certificats
sudo certbot certonly --standalone -d votre-domaine.com

# Les certificats seront dans /etc/letsencrypt/live/votre-domaine.com/
# - fullchain.pem (certificat)
# - privkey.pem (clé privée)
```

### Configuration Docker

**HTTPS automatique** : Le frontend active HTTPS automatiquement si les certificats sont montés dans le volume. Plus besoin de `USE_HTTPS=true` - la détection est automatique.

**Ports exposés :**
- **HTTP** : `http://localhost:8080` (backend), `http://localhost:3000` (frontend)
- **HTTPS** : `https://localhost:8443` (backend), `https://localhost:3443` (frontend)

**Comportement** :
- Si les certificats sont présents → HTTPS activé automatiquement
- Si les certificats sont absents → HTTP avec avertissement
- Pour forcer HTTP : `USE_HTTP_ONLY=true`

### Configuration manuelle (sans Docker)

#### Backend Node.js

```bash
# 1. Générer les certificats
cd backend-node
./generate-certs.sh

# 2. Activer HTTPS
export USE_HTTPS=true
npm start
```

Le backend écoutera sur :
- HTTP : `http://localhost:8080`
- HTTPS : `https://localhost:8443`

#### Frontend (Nginx)

Si vous utilisez Nginx manuellement :

```bash
# Copier les certificats
sudo cp backend-node/certs/* /etc/nginx/ssl/

# Utiliser nginx-https.conf
sudo cp frontend/nginx-https.conf /etc/nginx/sites-available/krown
sudo ln -s /etc/nginx/sites-available/krown /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Avertissement navigateur (certificats auto-signés)

Les certificats auto-signés génèrent un avertissement dans le navigateur. Pour le développement :

1. Cliquez sur "Avancé" / "Advanced"
2. Cliquez sur "Continuer vers localhost" / "Proceed to localhost"

### Production avec Let's Encrypt

#### 1. Obtenir les certificats

```bash
sudo certbot certonly --standalone -d votre-domaine.com
```

#### 2. Modifier docker-compose.yml

```yaml
backend:
  volumes:
    - /etc/letsencrypt/live/votre-domaine.com/fullchain.pem:/app/certs/cert.pem:ro
    - /etc/letsencrypt/live/votre-domaine.com/privkey.pem:/app/certs/key.pem:ro

frontend:
  volumes:
    - /etc/letsencrypt/live/votre-domaine.com/fullchain.pem:/etc/nginx/ssl/cert.pem:ro
    - /etc/letsencrypt/live/votre-domaine.com/privkey.pem:/etc/nginx/ssl/key.pem:ro
```

#### 3. Renouvellement automatique

Ajoutez un cron job pour renouveler les certificats :

```bash
# Éditer crontab
sudo crontab -e

# Ajouter (renouvellement mensuel)
0 0 1 * * certbot renew --quiet && docker compose restart frontend backend
```

### Désactiver HTTPS

Pour désactiver HTTPS temporairement :

```yaml
# Dans docker-compose.yml
backend:
  environment:
    - USE_HTTPS=false

frontend:
  environment:
    - USE_HTTPS=false
```

Ou en ligne de commande :

```bash
USE_HTTPS=false docker compose up
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

**Avec authentification par mot de passe :**

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

**Avec authentification par clé SSH privée :**

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

Réponse :
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

**Note** : Le format de la requête accepte soit `password` soit `private_key` (pas les deux). Le backend transforme automatiquement la réponse de l'agent C pour correspondre au format `Session` attendu par le frontend.

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

Le serveur expose un WebSocket sur `ws://localhost:8080` (ou `wss://localhost:8443` en HTTPS) avec les événements :

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

Le frontend React est disponible sur `http://localhost:3000` (ou `https://localhost:3443` en HTTPS) après avoir lancé :

```bash
cd frontend
npm install
npm run dev
```

**Configuration HTTPS automatique** : En production avec Docker, le frontend active automatiquement HTTPS si les certificats sont présents dans `/etc/nginx/ssl/`. Sinon, il utilise HTTP avec un avertissement.

L'interface permet de :
- **Gérer les serveurs SSH** : Ajouter, modifier, supprimer des serveurs avec authentification par mot de passe ou clé SSH
- **Créer des sessions SSH** : Se connecter à un serveur configuré en un clic
- **Terminal virtuel** : Exécuter des commandes en temps réel via xterm.js
- **WebSocket en temps réel** : Affichage des sorties SSH en direct
- **Historique** : Consulter l'historique des sessions et commandes exécutées
- **Logs système** : Visualiser les logs de l'application

**Format d'authentification** : Le frontend envoie `password` ou `private_key` directement dans la requête, selon la méthode d'authentification choisie lors de la configuration du serveur.

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
│   ├── Makefile
│   └── COMPILE.md        # Guide de compilation
│
├── backend-node/         # API Node.js
│   ├── server.js         # Serveur Express + Socket.io
│   ├── agent-client.js   # Client pour communiquer avec l'agent C
│   ├── https-server.js   # Configuration HTTPS
│   ├── generate-certs.sh # Script génération certificats
│   ├── test-agent.js     # Script de test
│   ├── certs/            # Certificats SSL (ignoré par Git)
│   └── package.json
│
├── frontend/             # Frontend React
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml    # Configuration Docker
├── package.json          # Scripts npm racine
├── .gitignore
├── .editorconfig
└── README.md             # Ce fichier
```

## Développement

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

## Déploiement en production

### Compiler et installer l'agent

```bash
cd agent
make
sudo make install  # Installe dans /usr/local/bin
```

### Créer un service systemd

**Important** : Créez d'abord l'utilisateur si vous utilisez `User=krown` :

```bash
sudo useradd -r -s /bin/false krown
```

Créez `/etc/systemd/system/krown-agent.service` :

```ini
[Unit]
Description=Krown SSH Agent
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=krown
Group=krown
ExecStart=/usr/local/bin/krown-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Sécurité
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/tmp

# Limites
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable krown-agent
sudo systemctl start krown-agent
sudo systemctl status krown-agent
```

**Note** : Si vous obtenez l'erreur `status=217/USER`, l'utilisateur n'existe pas. Créez-le avec `sudo useradd -r -s /bin/false krown`.

### Variables d'environnement

Pour l'API Node.js, vous pouvez définir :

```bash
export PORT=8080
export HTTPS_PORT=8443
export AGENT_SOCKET=/tmp/krown-agent.sock
export USE_HTTPS=true
```

## Dépannage

### Erreur : "Vite requires Node.js version 20.19+ or 22.12+"

Vous utilisez Node.js 18.x mais Vite 7.x nécessite Node.js 20.19+ ou 22.12+.

**Solution 1 : Mettre à jour Node.js (recommandé)**

```bash
# Avec nvm
nvm install 22
nvm use 22
nvm alias default 22

# Ou avec NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Solution 2 : Utiliser Vite 5.x (compatible Node.js 18)**

Le projet a été configuré pour utiliser Vite 5.x si vous restez sur Node.js 18 :

```bash
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

### Erreur systemd : "status=217/USER"

L'utilisateur spécifié dans le service systemd n'existe pas.

**Solution :**

```bash
# Créer l'utilisateur
sudo useradd -r -s /bin/false krown

# Ou modifier le service pour utiliser root (non recommandé)
# User=root

# Recharger systemd
sudo systemctl daemon-reload
sudo systemctl restart krown-agent
```

### Erreur systemd : "status=203/EXEC"

Le binaire ne peut pas être exécuté par systemd.

**Solution :**

```bash
# 1. Vérifier que le binaire existe
ls -l /usr/local/bin/krown-agent

# 2. Si absent, compiler et installer
cd agent
make
sudo make install

# 3. Vérifier les permissions
sudo chmod +x /usr/local/bin/krown-agent

# 4. Vérifier les dépendances
ldd /usr/local/bin/krown-agent

# 5. Tester manuellement
/usr/local/bin/krown-agent

# 6. Recharger systemd
sudo systemctl daemon-reload
sudo systemctl restart krown-agent
```

**Alternative :** Si le binaire n'est pas installé, utilisez le chemin complet dans le service :

```ini
ExecStart=/chemin/complet/vers/KROWN/agent/bin/krown-agent
WorkingDirectory=/chemin/complet/vers/KROWN/agent
```

### Erreurs de compilation de l'agent

```bash
# Installer toutes les dépendances
cd agent
make deps

# Ou manuellement
sudo apt-get install libssh-dev libjson-c-dev build-essential

# Nettoyer et recompiler
make clean
make

# Vérifier la compilation
ls -l bin/krown-agent
ldd bin/krown-agent
```

**Erreurs courantes :**

- `json-c/json.h: No such file` → `sudo apt-get install libjson-c-dev`
- `libssh/libssh.h: No such file` → `sudo apt-get install libssh-dev`
- `undefined reference` → Vérifiez que les bibliothèques sont dans LDFLAGS

Voir [agent/COMPILE.md](agent/COMPILE.md) pour plus de détails.

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

### Le backend Docker ne peut pas communiquer avec l'agent

```bash
# Vérifier que le volume est partagé
docker compose exec backend ls -l /tmp/krown-agent.sock

# Vérifier les permissions
docker compose exec agent ls -l /tmp/krown-agent.sock
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
- Utiliser des certificats SSL signés par une CA (Let's Encrypt)

## License

GPL-3.0 - Voir [LICENSE](LICENSE) pour plus de détails.

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.
