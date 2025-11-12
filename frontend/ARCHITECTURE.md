# Architecture Frontend - Krown

## Vue d'ensemble

Le frontend Krown est une application React moderne construite avec TypeScript, utilisant une architecture modulaire et des patterns de design éprouvés.

## Stack Technique

### Core
- **React 18** : Bibliothèque UI avec hooks et Context API
- **TypeScript** : Typage statique pour la sécurité du code
- **Vite** : Build tool rapide et moderne

### Routing & Navigation
- **React Router v6** : Gestion des routes et navigation
- Routes protégées avec authentification

### State Management
- **Context API** : State global (authentification)
- **useState/useEffect** : State local des composants
- Pas de Redux/Zustand (simplicité pour ce PoC)

### Communication
- **Axios** : Client HTTP pour les requêtes REST
- **WebSocket natif** : Communication temps réel
- Intercepteurs pour l'authentification automatique

### UI Components
- **xterm.js** : Terminal virtuel pour SSH
- **Lucide React** : Icônes modernes
- **CSS Modules** : Styles modulaires

## Architecture des Composants

### Structure Hiérarchique

```
App
├── AuthProvider (Context)
│   └── BrowserRouter
│       └── Routes
│           ├── Login (public)
│           └── Protected Routes
│               └── Layout
│                   ├── Sidebar
│                   ├── Topbar
│                   └── Page Content
│                       ├── Dashboard
│                       ├── ServerManager
│                       ├── Terminal
│                       └── History
```

### Composants Principaux

#### 1. Layout
- **Responsabilité** : Structure générale de l'application
- **Composants** : Sidebar, Topbar, Navigation
- **State** : Menu mobile ouvert/fermé

#### 2. Login
- **Responsabilité** : Authentification utilisateur
- **State** : Formulaire, erreurs, loading
- **Actions** : Appel API login, redirection

#### 3. Dashboard
- **Responsabilité** : Vue d'ensemble
- **Data** : Sessions, serveurs (localStorage)
- **Actions** : Navigation vers autres pages

#### 4. ServerManager
- **Responsabilité** : CRUD serveurs SSH
- **State** : Liste serveurs, modal, formulaire
- **Storage** : localStorage (à migrer vers backend)
- **Actions** : Créer/modifier/supprimer serveur, créer session

#### 5. Terminal
- **Responsabilité** : Terminal SSH interactif
- **Dependencies** : xterm.js, WebSocket
- **State** : Session, commandes, historique
- **Actions** : Exécuter commandes, afficher sorties

#### 6. History
- **Responsabilité** : Historique sessions et commandes
- **Data** : Sessions, command logs
- **Actions** : Filtrer, naviguer vers terminal

## Flux de Données

### Authentification

```
User Input → Login Component
    ↓
AuthContext.login()
    ↓
apiService.login()
    ↓
Backend API
    ↓
JWT Token + User
    ↓
localStorage + Context
    ↓
Protected Routes Access
```

### Création de Session SSH

```
ServerManager → Create Session
    ↓
apiService.createSession()
    ↓
Backend API
    ↓
Session Created
    ↓
Navigate to Terminal
    ↓
WebSocket Connect
    ↓
Subscribe to Session
```

### Exécution de Commande

```
Terminal → User Input
    ↓
apiService.executeCommand()
    ↓
Backend API
    ↓
Command Execution
    ↓
WebSocket Messages (stdout/stderr)
    ↓
xterm.js Display
```

## Services

### API Service (`services/api.ts`)

**Responsabilités** :
- Configuration Axios avec base URL
- Intercepteurs pour token JWT
- Méthodes pour tous les endpoints REST
- Gestion d'erreurs (401 → logout)

**Pattern** :
```typescript
class ApiService {
  private client: AxiosInstance
  
  async methodName(params): Promise<Type> {
    const response = await this.client.method('/endpoint', data)
    return response.data
  }
}
```

### WebSocket Service (`services/websocket.ts`)

**Responsabilités** :
- Gestion de la connexion WebSocket
- Authentification via token
- Subscription aux sessions
- Système d'événements (on/off)
- Reconnexion automatique

**Pattern** :
```typescript
class WebSocketService {
  connect(token: string)
  subscribe(sessionId: string)
  on<T>(type: string, callback: (data: T) => void)
  send(data: any)
}
```

## State Management

### Context API

**AuthContext** :
- `user` : Utilisateur connecté
- `token` : JWT token
- `login()` : Fonction de connexion
- `logout()` : Fonction de déconnexion
- `loading` : État de chargement

**Avantages** :
- Simple et intégré à React
- Pas de dépendance externe
- Suffisant pour ce PoC

**Limitations** :
- Pas de middleware
- Pas de devtools
- Peut devenir complexe avec plus de state

### Local State

Chaque composant gère son propre state avec `useState` :
- Formulaires
- Modals
- Loading states
- Filtres et recherches

## Routing

### Structure des Routes

```typescript
/                    → Dashboard (protected)
/login              → Login (public)
/servers            → ServerManager (protected)
/terminal/:id       → Terminal (protected)
/history            → History (protected)
```

### Protection des Routes

```typescript
<ProtectedRoute>
  <Layout>
    <Page />
  </Layout>
</ProtectedRoute>
```

Vérifie l'authentification et redirige vers `/login` si nécessaire.

## Styling

### Approche

- **CSS Modules** : Styles par composant
- **Variables CSS** : Thème cohérent
- **Thème sombre** : Par défaut
- **Responsive** : Mobile-first

### Variables CSS

```css
:root {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --accent: #3b82f6;
  --text-primary: #f1f5f9;
  /* ... */
}
```

### Responsive Design

- **Desktop** : Sidebar fixe, layout en colonnes
- **Mobile** : Menu hamburger, sidebar overlay
- **Breakpoint** : 768px

## Terminal SSH

### xterm.js Integration

**Initialisation** :
```typescript
const xterm = new XTerm({ theme, fontSize, ... })
const fitAddon = new FitAddon()
xterm.loadAddon(fitAddon)
xterm.open(container)
```

**Affichage** :
- Écriture directe avec `xterm.write()`
- Formatage avec codes ANSI
- Scroll automatique

**WebSocket Integration** :
- Messages `command_output` → affichage stdout/stderr
- Messages `command_complete` → affichage code de sortie
- Messages `session_update` → mise à jour statut

## Gestion d'Erreurs

### Niveaux

1. **API Errors** : Intercepteur Axios
   - 401 → Logout automatique
   - Autres → Affichage message

2. **WebSocket Errors** : Reconnexion automatique
   - Max 5 tentatives
   - Délai exponentiel

3. **Component Errors** : try/catch local
   - Affichage message utilisateur
   - Log console pour debug

## Performance

### Optimisations

- **Code Splitting** : Lazy loading des routes (à implémenter)
- **Memoization** : useMemo/useCallback si nécessaire
- **Virtual Scrolling** : Pour grandes listes (à implémenter)

### Bundle Size

- **xterm.js** : ~200KB (gzipped)
- **React + React DOM** : ~45KB (gzipped)
- **Total estimé** : ~500KB (gzipped)

## Sécurité

### Bonnes Pratiques

- ✅ Token JWT dans localStorage (à migrer vers httpOnly cookie)
- ✅ Validation côté client ET serveur
- ✅ Pas de stockage de mots de passe en clair
- ✅ HTTPS en production (via reverse proxy)
- ✅ CORS configuré côté backend

### Améliorations Futures

- [ ] httpOnly cookies pour JWT
- [ ] Refresh tokens
- [ ] Rate limiting côté client
- [ ] CSP headers

## Tests (À implémenter)

### Unitaires
- Composants isolés
- Hooks personnalisés
- Services

### Intégration
- Flux d'authentification
- Création de session
- Exécution de commandes

### E2E
- Scénarios complets utilisateur
- Cypress ou Playwright

## Déploiement

### Build

```bash
npm run build
```

Génère un dossier `dist/` avec :
- HTML statique
- JS bundle
- CSS bundle
- Assets

### Serveur Web

- **Nginx** : Reverse proxy vers backend
- **Serveur statique** : Pour les fichiers frontend
- **HTTPS** : Obligatoire en production

### Configuration Nginx

```nginx
server {
    listen 80;
    server_name krown.example.com;
    
    location / {
        root /var/www/krown;
        try_files $uri /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:8080;
    }
    
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Roadmap

### v0.2
- [ ] Migration serveurs vers backend
- [ ] Notifications toast
- [ ] Thème clair/sombre
- [ ] Export logs

### v0.3
- [ ] Multi-terminal (onglets)
- [ ] Recherche dans historique
- [ ] Filtres avancés
- [ ] Graphiques de performance

### v1.0
- [ ] PWA
- [ ] Mode hors ligne
- [ ] Tests complets
- [ ] Documentation utilisateur

