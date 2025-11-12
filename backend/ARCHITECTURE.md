# Architecture du Backend Rust - Krown

## Vue d'ensemble

Le backend Krown est construit en Rust avec une architecture modulaire permettant la gestion sécurisée de sessions SSH multiples, une API REST complète, et une communication temps réel via WebSocket.

## Architecture Modulaire

```
krown-backend/
├── src/
│   ├── main.rs          # Point d'entrée, orchestration
│   ├── config.rs        # Gestion de la configuration (TOML)
│   ├── database.rs      # Abstraction de la base de données (SQLite/PostgreSQL)
│   ├── auth.rs          # Authentification (JWT, Argon2)
│   ├── ssh.rs           # Gestion des sessions SSH (async-ssh2)
│   ├── api.rs           # API REST (Axum)
│   ├── websocket.rs     # Communication temps réel
│   ├── models.rs        # Modèles de données
│   └── error.rs         # Gestion d'erreurs centralisée
```

## Modules Principaux

### 1. Configuration (`config.rs`)

**Responsabilités :**
- Chargement de la configuration depuis TOML
- Validation des paramètres
- Support des variables d'environnement

**Structure :**
- `ServerConfig` : Host, port, CORS
- `DatabaseConfig` : URL de connexion, pool size
- `SshConfig` : Timeouts, limites de sessions
- `AuthConfig` : JWT secret, expiration, règles de mot de passe
- `LoggingConfig` : Niveau de log, fichier de sortie

### 2. Base de Données (`database.rs`)

**Responsabilités :**
- Gestion du pool de connexions (SQLite/PostgreSQL)
- Migrations automatiques
- Abstraction des requêtes SQL

**Tables :**
- `users` : Utilisateurs et rôles
- `sessions` : Sessions SSH actives/historiques
- `command_logs` : Logs de toutes les commandes exécutées

**Migrations :**
Les migrations sont exécutées automatiquement au démarrage via SQL brut.

### 3. Authentification (`auth.rs`)

**Responsabilités :**
- Création d'utilisateurs avec hash de mot de passe (Argon2)
- Authentification par login/password
- Génération et validation de tokens JWT
- Gestion des rôles (Admin, Operator, ReadOnly)

**Sécurité :**
- Hash de mot de passe avec Argon2 (résistant aux attaques)
- JWT avec expiration configurable
- Validation stricte des entrées

### 4. Gestion SSH (`ssh.rs`)

**Responsabilités :**
- Création et gestion de sessions SSH multiples
- Authentification par mot de passe ou clé privée
- Exécution de commandes à distance
- Gestion des timeouts et erreurs
- Logging de toutes les commandes

**Architecture :**
- `SshManager` : Gestionnaire central des sessions
- `SshSession` : Wrapper autour de `async-ssh2::ClientSession`
- Stockage en mémoire avec `Arc<RwLock<HashMap>>` pour accès concurrent

**Fonctionnalités :**
- Connexion avec timeout configurable
- Exécution de commandes avec timeout
- Gestion automatique des déconnexions
- Logging complet pour audit

### 5. API REST (`api.rs`)

**Framework :** Axum (async, type-safe, performant)

**Endpoints :**

#### Authentification
- `POST /api/auth/register` : Création d'utilisateur
- `POST /api/auth/login` : Connexion (retourne JWT)

#### Sessions SSH
- `GET /api/sessions` : Liste des sessions de l'utilisateur
- `POST /api/sessions` : Créer une nouvelle session SSH
- `GET /api/sessions/:id` : Détails d'une session
- `DELETE /api/sessions/:id` : Fermer une session
- `POST /api/sessions/:id/execute` : Exécuter une commande

#### Utilisateurs
- `GET /api/users` : Liste des utilisateurs (admin only)
- `GET /api/users/:id` : Détails d'un utilisateur

**Sécurité :**
- Authentification JWT requise pour tous les endpoints (sauf register/login)
- Vérification de propriété (users ne peuvent accéder qu'à leurs sessions)
- Contrôle d'accès basé sur les rôles

### 6. WebSocket (`websocket.rs`)

**Responsabilités :**
- Communication temps réel avec le frontend
- Notifications de changements d'état
- Streaming de logs en temps réel
- Ping/Pong pour maintenir la connexion

**Messages supportés :**
- `authenticate` : Authentification avec token JWT
- `subscribe_session` : S'abonner aux updates d'une session
- `ping` : Keepalive

**Fonctionnalités futures :**
- Broadcast des logs de commandes en temps réel
- Notifications de changements d'état de session
- Streaming de sortie de commandes

### 7. Modèles (`models.rs`)

**Structures principales :**
- `User` : Utilisateur avec rôle
- `Session` : Session SSH avec statut
- `CommandExecution` : Résultat d'exécution de commande
- `CommandLog` : Log stocké en base

**Enums :**
- `UserRole` : Admin, Operator, ReadOnly
- `SessionStatus` : Connecting, Connected, Disconnected, Error
- `AuthMethod` : Password ou Key

### 8. Gestion d'Erreurs (`error.rs`)

**Approche :** `thiserror` pour des erreurs typées

**Types d'erreurs :**
- `Database` : Erreurs SQLx
- `Ssh` : Erreurs de connexion/commande SSH
- `Auth` : Erreurs d'authentification
- `SessionNotFound` : Session introuvable
- `PermissionDenied` : Accès refusé
- `InvalidInput` : Validation d'entrée
- `WebSocket` : Erreurs WebSocket

**Conversion automatique en réponses HTTP** avec codes de statut appropriés.

## Flux de Données

### Création d'une Session SSH

```
1. Client → POST /api/sessions (avec JWT)
2. API → Authentification JWT
3. API → SshManager::create_session()
4. SshManager → Connexion SSH (avec timeout)
5. SshManager → Insertion en base de données
6. SshManager → Stockage en mémoire (HashMap)
7. API → Retour de Session au client
```

### Exécution d'une Commande

```
1. Client → POST /api/sessions/:id/execute
2. API → Vérification de propriété
3. SshManager → Récupération de la session en mémoire
4. SshManager → Exécution de la commande (avec timeout)
5. SshManager → Logging en base de données
6. API → Retour du résultat au client
```

### WebSocket - Streaming de Logs

```
1. Client → Connexion WebSocket
2. Client → Message "authenticate" avec JWT
3. Server → Validation JWT
4. Client → Message "subscribe_session" avec session_id
5. Server → Envoi périodique des logs (à implémenter)
```

## Sécurité

### Authentification
- **JWT** : Tokens signés avec expiration
- **Argon2** : Hash de mot de passe résistant
- **Validation** : Toutes les entrées sont validées

### Autorisation
- **Rôles** : Admin, Operator, ReadOnly
- **Propriété** : Users ne peuvent accéder qu'à leurs ressources
- **Isolation** : Sessions isolées par utilisateur

### Protection des Données
- **Pas de stockage de mots de passe en clair**
- **Pas de fuite de clés privées SSH** (à implémenter avec chiffrement)
- **Logging sécurisé** : Pas de logs de mots de passe

### Timeouts
- **Connexion SSH** : Timeout configurable
- **Exécution de commandes** : Timeout par commande
- **Sessions** : Timeout d'inactivité

## Performance

### Async/Await
- **Tokio** : Runtime async performant
- **Concurrence** : Gestion de milliers de connexions simultanées
- **Non-bloquant** : Toutes les opérations I/O sont async

### Base de Données
- **Pool de connexions** : Réutilisation des connexions
- **Indexes** : Index sur les colonnes fréquemment requêtées
- **Requêtes optimisées** : Pas de N+1 queries

### Mémoire
- **Arc/RwLock** : Partage sécurisé des sessions
- **Pas de fuites** : Gestion automatique avec Drop
- **Limites** : Max sessions par utilisateur configurable

## Extensibilité

### Plugins (Future)
- Interface de plugin pour ajouter des fonctionnalités
- Support de différents types de sessions (non-SSH)
- Hooks pour audit et monitoring

### Monitoring
- Métriques Prometheus (à ajouter)
- Health checks
- Logging structuré avec tracing

### Multi-tenant (Future)
- Isolation par organisation
- Quotas par tenant
- Billing et usage tracking

## Déploiement

### Configuration
- Fichier TOML pour configuration locale
- Variables d'environnement pour production
- Secrets via variables d'env (JWT_SECRET)

### Base de Données
- SQLite pour développement
- PostgreSQL pour production
- Migrations automatiques

### Logging
- Tracing avec `tracing-subscriber`
- Logs structurés (JSON optionnel)
- Rotation de logs (à configurer)

## Tests

### Unitaires
- Tests des modules individuels
- Mocks pour SSH et DB

### Intégration
- Tests end-to-end de l'API
- Tests de sessions SSH réelles

### Performance
- Benchmarks avec criterion
- Tests de charge

## Roadmap

### v0.2
- [ ] Support complet de l'authentification par clé SSH
- [ ] Replay de sessions pour audit
- [ ] Exécution parallèle sur plusieurs machines
- [ ] Interface WebSocket complète avec streaming

### v0.3
- [ ] Support PostgreSQL
- [ ] Métriques Prometheus
- [ ] Rate limiting
- [ ] Audit trail complet

### v1.0
- [ ] Multi-tenant
- [ ] Plugins système
- [ ] HA/Clustering
- [ ] Documentation complète

