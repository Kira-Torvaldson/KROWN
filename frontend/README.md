# Krown Frontend - React

Interface utilisateur moderne pour la gestion centralisée de sessions SSH.

## Technologies

- **React 18** avec TypeScript
- **Vite** pour le build et le développement
- **React Router** pour la navigation
- **Axios** pour les requêtes API
- **xterm.js** pour le terminal virtuel
- **WebSocket** pour la communication temps réel
- **Context API** pour le state management
- **Lucide React** pour les icônes
- **date-fns** pour le formatage des dates

## Structure du Projet

```
frontend/
├── src/
│   ├── components/          # Composants réutilisables
│   │   ├── Layout.tsx      # Layout principal avec sidebar
│   │   └── Layout.css
│   ├── contexts/           # Context API pour le state
│   │   └── AuthContext.tsx # Gestion de l'authentification
│   ├── pages/              # Pages de l'application
│   │   ├── Login.tsx       # Page de connexion
│   │   ├── Dashboard.tsx    # Tableau de bord
│   │   ├── ServerManager.tsx # Gestion des serveurs
│   │   ├── Terminal.tsx    # Terminal SSH
│   │   └── History.tsx    # Historique des sessions
│   ├── services/           # Services API et WebSocket
│   │   ├── api.ts          # Service REST API
│   │   └── websocket.ts    # Service WebSocket
│   ├── types/              # Types TypeScript
│   │   └── index.ts
│   ├── App.tsx             # Composant racine
│   ├── main.tsx            # Point d'entrée
│   └── index.css            # Styles globaux
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Installation

```bash
cd frontend
npm install
```

## Développement

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

## Build pour Production

```bash
npm run build
```

Les fichiers compilés seront dans le dossier `dist/`.

## Configuration

### Variables d'environnement

Créer un fichier `.env` :

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=localhost:8080
```

## Fonctionnalités

### 1. Authentification
- Page de connexion avec validation
- Stockage du token JWT dans localStorage
- Protection des routes avec authentification

### 2. Dashboard
- Vue d'ensemble des serveurs et sessions
- Statistiques rapides
- Liste des sessions récentes

### 3. Gestion des Serveurs
- CRUD complet des serveurs SSH
- Support authentification par mot de passe ou clé SSH
- Stockage local dans localStorage
- Connexion rapide aux serveurs

### 4. Terminal SSH
- Terminal virtuel avec xterm.js
- Exécution de commandes en temps réel
- Affichage des sorties stdout/stderr
- Historique des commandes (flèches haut/bas)
- WebSocket pour les mises à jour en temps réel

### 5. Historique
- Liste de toutes les sessions
- Détails des commandes exécutées
- Affichage des sorties et codes de sortie
- Filtrage par session

## Architecture

### State Management

Utilisation de **Context API** pour gérer l'état global :
- `AuthContext` : Authentification et utilisateur connecté

### Services

- **apiService** : Toutes les requêtes REST vers le backend
- **wsService** : Gestion de la connexion WebSocket et des messages

### Routing

Routes protégées avec authentification :
- `/login` - Page de connexion
- `/` - Dashboard
- `/servers` - Gestion des serveurs
- `/terminal/:sessionId` - Terminal SSH
- `/history` - Historique des sessions

## Styles

- Thème sombre par défaut
- Variables CSS pour la cohérence
- Design moderne et responsive
- Support mobile avec menu hamburger

## Intégration avec le Backend

Le frontend communique avec le backend Rust via :
- **REST API** : Endpoints `/api/*`
- **WebSocket** : Endpoint `/ws`

### Endpoints utilisés

- `POST /api/auth/login` - Connexion
- `GET /api/sessions` - Liste des sessions
- `POST /api/sessions` - Créer une session
- `GET /api/sessions/:id` - Détails d'une session
- `DELETE /api/sessions/:id` - Fermer une session
- `POST /api/sessions/:id/execute` - Exécuter une commande

## Développement Futur

- [ ] Page de configuration utilisateur
- [ ] Notifications visuelles pour changements d'état
- [ ] Support multi-terminal (onglets)
- [ ] Export des logs de session
- [ ] Thème clair/sombre
- [ ] Mode hors ligne
- [ ] PWA (Progressive Web App)

## Notes

- Les serveurs sont stockés dans `localStorage` (à migrer vers le backend)
- Le terminal utilise xterm.js pour un rendu performant
- Le WebSocket se reconnecte automatiquement en cas de déconnexion

