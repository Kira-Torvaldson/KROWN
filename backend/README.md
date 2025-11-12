# Krown Backend - Rust

Backend performant et sécurisé pour la gestion centralisée de sessions SSH, écrit en Rust.

## Fonctionnalités

- ✅ Gestion de sessions SSH multiples simultanées
- ✅ Authentification JWT avec rôles (Admin, Operator, ReadOnly)
- ✅ API REST complète (CRUD sessions et utilisateurs)
- ✅ WebSocket pour communication temps réel
- ✅ Logging détaillé de toutes les commandes
- ✅ Configuration via TOML
- ✅ Support SQLite et PostgreSQL
- ✅ Gestion d'erreurs robuste
- ✅ Timeouts configurables

## Prérequis

- Rust 1.70+ (installer via [rustup](https://rustup.rs/))
- SQLite (pour développement) ou PostgreSQL (pour production)
- OpenSSL (pour async-ssh2)

### Installation de Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Dépendances système (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libssl-dev sqlite3 libsqlite3-dev
```

## Installation

### 1. Cloner et compiler

```bash
cd backend-rust
cargo build --release
```

### 2. Configuration

Copier le fichier de configuration exemple :

```bash
cp config.toml.example config.toml
```

Éditer `config.toml` et configurer :
- **JWT Secret** : Utiliser une clé forte en production
- **Database URL** : `sqlite:krown.db` pour dev, ou PostgreSQL pour prod
- **Port** : Port d'écoute du serveur (défaut: 8080)

**Important :** En production, définir `KROWN_JWT_SECRET` comme variable d'environnement :

```bash
export KROWN_JWT_SECRET="your-very-secure-secret-key-here"
```

### 3. Lancer le serveur

```bash
# Mode développement (avec logs détaillés)
RUST_LOG=debug cargo run

# Mode production
cargo run --release
```

Le serveur démarre sur `http://0.0.0.0:8080` par défaut.

## Utilisation

### Créer un utilisateur admin

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "SecurePassword123!",
    "email": "admin@example.com",
    "role": "admin"
  }'
```

### Se connecter

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "SecurePassword123!"
  }'
```

Réponse :
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

### Créer une session SSH

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "host": "example.com",
    "port": 22,
    "username": "user",
    "auth_method": {
      "Password": {
        "password": "password123"
      }
    }
  }'
```

### Exécuter une commande

```bash
SESSION_ID="session-uuid-here"

curl -X POST http://localhost:8080/api/sessions/$SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "command": "ls -la",
    "timeout_secs": 30
  }'
```

### Lister les sessions

```bash
curl -X GET http://localhost:8080/api/sessions \
  -H "Authorization: Bearer $TOKEN"
```

### WebSocket

Connexion WebSocket pour les notifications temps réel :

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  // Authentifier
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your-jwt-token'
  }));
  
  // S'abonner à une session
  ws.send(JSON.stringify({
    type: 'subscribe_session',
    session_id: 'session-uuid'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

## API Documentation

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour la documentation complète de l'architecture.

### Endpoints Principaux

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/auth/register` | Créer un utilisateur | Non |
| POST | `/api/auth/login` | Se connecter | Non |
| GET | `/api/sessions` | Lister les sessions | Oui |
| POST | `/api/sessions` | Créer une session SSH | Oui |
| GET | `/api/sessions/:id` | Détails d'une session | Oui |
| DELETE | `/api/sessions/:id` | Fermer une session | Oui |
| POST | `/api/sessions/:id/execute` | Exécuter une commande | Oui |
| GET | `/api/users` | Lister les utilisateurs | Admin |
| GET | `/api/users/:id` | Détails d'un utilisateur | Oui |
| GET | `/ws` | WebSocket | Oui |

## Structure du Projet

```
backend-rust/
├── src/
│   ├── main.rs          # Point d'entrée
│   ├── config.rs        # Configuration
│   ├── database.rs      # Base de données
│   ├── auth.rs          # Authentification
│   ├── ssh.rs           # Gestion SSH
│   ├── api.rs           # API REST
│   ├── websocket.rs     # WebSocket
│   ├── models.rs        # Modèles de données
│   └── error.rs         # Gestion d'erreurs
├── Cargo.toml           # Dépendances
├── config.toml.example  # Exemple de configuration
└── README.md            # Ce fichier
```

## Développement

### Tests

```bash
cargo test
```

### Formatage

```bash
cargo fmt
```

### Linting

```bash
cargo clippy
```

### Logs

Le niveau de log est contrôlé par la variable d'environnement `RUST_LOG` :

```bash
RUST_LOG=debug cargo run
RUST_LOG=info cargo run
RUST_LOG=warn cargo run
```

## Production

### Variables d'Environnement

```bash
export KROWN_JWT_SECRET="your-secure-secret"
export KROWN_CONFIG="/path/to/config.toml"
export RUST_LOG=info
```

### Systemd Service

Créer `/etc/systemd/system/krown-backend.service` :

```ini
[Unit]
Description=Krown Backend
After=network.target

[Service]
Type=simple
User=krown
WorkingDirectory=/opt/krown/backend-rust
ExecStart=/opt/krown/backend-rust/target/release/krown-backend
Environment="KROWN_JWT_SECRET=your-secret"
Environment="RUST_LOG=info"
Restart=always

[Install]
WantedBy=multi-user.target
```

### Docker (Future)

Un Dockerfile sera fourni dans une version future.

## Sécurité

⚠️ **Important pour la production :**

1. **JWT Secret** : Utiliser une clé forte et unique
2. **HTTPS** : Toujours utiliser HTTPS en production (reverse proxy)
3. **Rate Limiting** : Ajouter un rate limiter (à implémenter)
4. **CORS** : Configurer correctement les origines autorisées
5. **Mots de passe** : Exiger des mots de passe forts
6. **Base de données** : Chiffrer la base de données si elle contient des données sensibles

## Limitations Actuelles

- Authentification par clé SSH : Partiellement implémentée
- Replay de sessions : À venir
- Exécution parallèle : À venir
- Métriques : À venir

## Contribution

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour comprendre l'architecture avant de contribuer.

## Licence

MIT OR Apache-2.0

