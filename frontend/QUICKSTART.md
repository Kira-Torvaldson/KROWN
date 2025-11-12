# Guide de Démarrage Rapide - Frontend Krown

## Prérequis

- Node.js 18+ et npm
- Backend Rust démarré sur `http://localhost:8080`

## Installation

```bash
cd frontend
npm install
```

## Démarrage

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

## Première Utilisation

### 1. Créer un compte

Le backend doit avoir un endpoint d'enregistrement. Sinon, créez un utilisateur directement via l'API :

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

### 2. Se connecter

1. Ouvrir `http://localhost:3000`
2. Entrer les identifiants
3. Cliquer sur "Se connecter"

### 3. Ajouter un serveur

1. Aller dans "Serveurs"
2. Cliquer sur "Nouveau serveur"
3. Remplir les informations :
   - Nom du serveur
   - Host/IP
   - Port (défaut: 22)
   - Nom d'utilisateur
   - Méthode d'authentification (mot de passe ou clé SSH)
4. Cliquer sur "Créer"

### 4. Se connecter à un serveur

1. Dans "Serveurs", cliquer sur "Se connecter" sur un serveur
2. Une session SSH sera créée
3. Vous serez redirigé vers le terminal

### 5. Utiliser le terminal

1. Taper une commande dans le champ en bas
2. Appuyer sur Entrée ou cliquer sur le bouton "Envoyer"
3. La sortie s'affichera dans le terminal
4. Utiliser les flèches haut/bas pour naviguer dans l'historique

## Structure des Fichiers

```
frontend/
├── src/
│   ├── pages/          # Pages principales
│   ├── components/     # Composants réutilisables
│   ├── services/       # API et WebSocket
│   ├── contexts/       # State management
│   └── types/          # Types TypeScript
├── package.json
└── vite.config.ts
```

## Configuration

Créer un fichier `.env` :

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=localhost:8080
```

## Dépannage

### L'application ne se connecte pas au backend

- Vérifier que le backend est démarré
- Vérifier l'URL dans `.env`
- Vérifier les CORS dans le backend

### Le terminal ne s'affiche pas

- Vérifier que xterm.js est installé : `npm list xterm`
- Vérifier la console du navigateur pour les erreurs

### Les WebSocket ne fonctionnent pas

- Vérifier que le proxy est configuré dans `vite.config.ts`
- Vérifier que le backend accepte les connexions WebSocket
- Vérifier la console du navigateur

## Build pour Production

```bash
npm run build
```

Les fichiers seront dans `dist/` et peuvent être servis par n'importe quel serveur web statique.

