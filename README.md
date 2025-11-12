# Krown - Centralisateur de Sessions SSH

Application complète pour la gestion centralisée de sessions SSH avec backend Rust et frontend React.

## 🚀 Démarrage Rapide

### Installation

**Important :** Exécutez toutes les commandes depuis la **racine** du projet (pas depuis `frontend/` ou `backend/`).

```bash
# 1. Installer npm-run-all à la racine
npm install

# 2. Installer toutes les dépendances (backend + frontend)
npm run install:all
```

**Note :** Si Rust n'est pas installé, le build du backend échouera. Vous pouvez :
- Installer Rust : https://rustup.rs/
- Ou installer uniquement le frontend : `npm run install:frontend`

### Développement

**Depuis la racine du projet :**

```bash
# Lancer le backend et le frontend en parallèle
npm run dev
```

**Ou lancer séparément :**

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend  
npm run dev:frontend
```

Cela démarre :
- **Backend Rust** sur `http://localhost:8080`
- **Frontend React** sur `http://localhost:3000`

### Production

```bash
# Build des deux projets
npm run build

# Lancer en mode production
npm start
```

## 📁 Structure du Projet

```
KROWN/
├── backend/          # Backend Rust (Axum + async-ssh2)
│   ├── src/
│   ├── Cargo.toml
│   └── config.toml.example
├── frontend/         # Frontend React (Vite + TypeScript)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── package.json      # Scripts npm racine
└── README.md
```

## 🛠️ Scripts Disponibles

### Installation
- `npm run install:all` - Installe toutes les dépendances
- `npm run install:backend` - Build le backend Rust
- `npm run install:frontend` - Installe les dépendances frontend

### Développement
- `npm run dev` - Lance backend + frontend en mode dev
- `npm run dev:backend` - Lance uniquement le backend
- `npm run dev:frontend` - Lance uniquement le frontend

### Build
- `npm run build` - Build les deux projets
- `npm run build:backend` - Build le backend en release
- `npm run build:frontend` - Build le frontend

### Production
- `npm start` - Lance backend + frontend en mode production
- `npm run start:backend` - Lance uniquement le backend
- `npm run start:frontend` - Lance uniquement le frontend

## ⚙️ Configuration

### Backend

1. Copier le fichier de configuration :
```bash
cp backend/config.toml.example backend/config.toml
```

2. Configurer les variables d'environnement :
```bash
export KROWN_JWT_SECRET="your-secret-key"
```

### Frontend

Créer un fichier `.env` dans `frontend/` :
```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=localhost:8080
```

## 📖 Documentation

- [Backend Architecture](backend/ARCHITECTURE.md)
- [Frontend Architecture](frontend/ARCHITECTURE.md)
- [Communication REST + WebSocket](COMMUNICATION.md)

## 🔧 Prérequis

- **Node.js** 18+ et npm
- **Rust** 1.70+ (pour le backend) - [Installer Rust](https://rustup.rs/)
- **SQLite** (pour le backend)
- **OpenSSL** (pour async-ssh2)

### Installation de Rust (Windows)

1. Télécharger et exécuter : https://rustup.rs/
2. Ou via PowerShell :
   ```powershell
   Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
   .\rustup-init.exe
   ```
3. Redémarrer le terminal après installation
4. Vérifier : `cargo --version`

### Installation de Rust (Linux/macOS)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## 🎯 Utilisation

**⚠️ Toutes les commandes depuis la RACINE du projet**

1. **Installer npm-run-all** :
   ```bash
   npm install
   ```

2. **Installer les dépendances** :
   ```bash
   npm run install:all
   ```
   Ou séparément :
   ```bash
   npm run install:frontend  # Frontend uniquement
   npm run install:backend   # Backend uniquement (nécessite Rust)
   ```

3. **Configurer** :
   - Backend : `backend/config.toml` (copier depuis `config.toml.example`)
   - Frontend : `frontend/.env` (optionnel, valeurs par défaut disponibles)

4. **Lancer en développement** :
   ```bash
   npm run dev
   ```

5. **Accéder à l'application** :
   - Frontend : http://localhost:3000
   - Backend API : http://localhost:8080

## 🧪 Première Utilisation

1. Créer un compte admin via l'API :
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

2. Se connecter via l'interface web
3. Ajouter un serveur SSH
4. Se connecter et utiliser le terminal

## 📝 Notes

- Le backend utilise SQLite par défaut (fichier `krown.db`)
- Les migrations sont exécutées automatiquement au démarrage
- Le frontend se connecte automatiquement au backend via le proxy Vite

## 🐛 Dépannage

### Le backend ne démarre pas
- Vérifier que Rust est installé : `cargo --version`
- Vérifier que SQLite est installé
- Vérifier le fichier `config.toml`

### Le frontend ne démarre pas
- Vérifier que Node.js est installé : `node --version`
- Installer les dépendances : `cd frontend && npm install`
- Vérifier le fichier `.env`

### Erreur de connexion entre frontend et backend
- Vérifier que le backend est démarré sur le port 8080
- Vérifier les CORS dans la configuration backend
- Vérifier le proxy dans `frontend/vite.config.ts`

## 📄 Licence

MIT OR Apache-2.0

