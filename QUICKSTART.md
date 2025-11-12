# Guide de Démarrage Rapide - Krown

## ⚠️ Important

**Toutes les commandes doivent être exécutées depuis la RACINE du projet**, pas depuis `frontend/` ou `backend/`.

## Installation Rapide

### 1. Installer les dépendances npm à la racine

```bash
cd C:\Users\k.humbert.CYBER\Desktop\KROWN
npm install
```

### 2. Installer les dépendances du projet

**Option A - Tout installer (nécessite Rust) :**
```bash
npm run install:all
```

**Option B - Frontend uniquement (si Rust n'est pas installé) :**
```bash
npm run install:frontend
```

**Option C - Backend uniquement :**
```bash
npm run install:backend
```

## Lancer l'Application

### Mode Développement

```bash
# Depuis la racine
npm run dev
```

Cela lance :
- Backend Rust sur `http://localhost:8080`
- Frontend React sur `http://localhost:3000`

### Lancer Séparément

**Terminal 1 - Backend :**
```bash
npm run dev:backend
```

**Terminal 2 - Frontend :**
```bash
npm run dev:frontend
```

## Configuration

### Backend

1. Créer le fichier de configuration :
```bash
cd backend
cp config.toml.example config.toml
```

2. (Optionnel) Configurer le JWT secret :
```bash
# Windows PowerShell
$env:KROWN_JWT_SECRET="your-secret-key"
```

### Frontend

Créer `frontend/.env` :
```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=localhost:8080
```

## Première Utilisation

1. **Créer un compte admin** :
```bash
curl -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"SecurePassword123!\",\"email\":\"admin@example.com\",\"role\":\"admin\"}"
```

2. **Ouvrir l'interface** : http://localhost:3000

3. **Se connecter** avec les identifiants créés

4. **Ajouter un serveur SSH** et commencer à l'utiliser

## Commandes Utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance backend + frontend |
| `npm run build` | Build pour production |
| `npm run install:all` | Installe toutes les dépendances |
| `npm run install:frontend` | Installe uniquement le frontend |
| `npm run install:backend` | Build uniquement le backend |

## Dépannage

### "cargo n'est pas reconnu"
- Installer Rust : https://rustup.rs/
- Redémarrer le terminal
- Vérifier : `cargo --version`

### "npm run install:all" ne fonctionne pas
- Vérifier que vous êtes à la racine du projet
- Vérifier que `npm install` a été exécuté à la racine
- Vérifier que `npm-run-all` est installé

### Le frontend ne se connecte pas au backend
- Vérifier que le backend est démarré
- Vérifier l'URL dans `frontend/.env`
- Vérifier les CORS dans `backend/config.toml`

