# Exemple Minimal Fonctionnel

Ce document décrit un exemple minimal pour tester le backend Krown.

## Prérequis

1. Compiler le projet : `cargo build --release`
2. Créer la configuration : `cp config.toml.example config.toml`
3. Démarrer le serveur : `cargo run`

## Scénario de Test Complet

### 1. Créer un utilisateur

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPassword123!",
    "email": "test@example.com",
    "role": "operator"
  }'
```

### 2. Se connecter et obtenir un token

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPassword123!"
  }' | jq -r '.token')

echo "Token: $TOKEN"
```

### 3. Créer une session SSH

**Note:** Remplacez `example.com` et les credentials par une vraie machine SSH accessible.

```bash
SESSION=$(curl -s -X POST http://localhost:8080/api/sessions \
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
  }' | jq -r '.id')

echo "Session ID: $SESSION"
```

### 4. Exécuter une commande

```bash
curl -X POST http://localhost:8080/api/sessions/$SESSION/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "command": "echo Hello from Krown",
    "timeout_secs": 30
  }' | jq
```

### 5. Lister les sessions

```bash
curl -X GET http://localhost:8080/api/sessions \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 6. Fermer la session

```bash
curl -X DELETE http://localhost:8080/api/sessions/$SESSION \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Test WebSocket (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  console.log('Connected');
  
  // Authentifier
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'YOUR_JWT_TOKEN_HERE'
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Received:', msg);
  
  if (msg.type === 'authenticated') {
    console.log('Authenticated as:', msg.username);
    
    // S'abonner à une session
    ws.send(JSON.stringify({
      type: 'subscribe_session',
      session_id: 'SESSION_UUID_HERE'
    }));
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

## Test avec un serveur SSH local

Pour tester sans accès à un serveur externe, vous pouvez créer un serveur SSH de test :

```bash
# Installer openssh-server
sudo apt-get install openssh-server

# Créer un utilisateur de test
sudo useradd -m -s /bin/bash testssh
sudo passwd testssh  # Définir un mot de passe

# Démarrer SSH (si pas déjà démarré)
sudo systemctl start sshd

# Tester la connexion
ssh testssh@localhost
```

Ensuite, utilisez `localhost` comme host dans les requêtes de création de session.

## Vérification de la Base de Données

```bash
# SQLite
sqlite3 krown.db

# Voir les utilisateurs
SELECT id, username, role, created_at FROM users;

# Voir les sessions
SELECT id, user_id, host, username, status, created_at FROM sessions;

# Voir les logs de commandes
SELECT id, session_id, command, exit_code, executed_at FROM command_logs LIMIT 10;
```

## Dépannage

### Erreur de connexion SSH

- Vérifier que le serveur SSH est accessible
- Vérifier les credentials (username/password)
- Vérifier le firewall
- Vérifier les logs du serveur : `RUST_LOG=debug cargo run`

### Erreur d'authentification

- Vérifier que le token JWT est valide
- Vérifier l'expiration du token (défaut: 24h)
- Vérifier le format de l'header : `Authorization: Bearer <token>`

### Erreur de base de données

- Vérifier que SQLite est installé
- Vérifier les permissions sur le fichier `krown.db`
- Vérifier les migrations : les tables doivent être créées automatiquement

