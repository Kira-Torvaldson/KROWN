# Guide de Dépannage - Krown

## Erreur Réseau lors de la Création de Compte

### Vérifications à faire

#### 1. Vérifier que le backend est démarré

```bash
# Depuis la racine du projet
cd backend
cargo run
```

Vous devriez voir :
```
Starting Krown Backend...
Configuration loaded from config.toml
Database initialized and migrated
Starting API server on 0.0.0.0:8080
```

#### 2. Tester l'endpoint de santé

```bash
# Dans un autre terminal
curl http://localhost:8080/api/health
```

Vous devriez recevoir :
```json
{"status":"ok"}
```

#### 3. Vérifier la configuration CORS

Le fichier `backend/config.toml` doit contenir :

```toml
[server]
host = "0.0.0.0"
port = 8080
cors_origins = ["http://localhost:3000", "http://localhost:5173"]
```

**Important :** Si vous utilisez un port différent pour le frontend, ajoutez-le à `cors_origins`.

#### 4. Vérifier que le frontend utilise le bon port

Le frontend doit être accessible sur un des ports configurés dans `cors_origins` :
- `http://localhost:3000` (défaut Vite)
- `http://localhost:5173` (port alternatif Vite)

#### 5. Vérifier la console du navigateur

Ouvrez les outils de développement (F12) et regardez l'onglet **Console** et **Network** :
- **Console** : Affiche les erreurs JavaScript
- **Network** : Affiche les requêtes HTTP et leurs erreurs

#### 6. Vérifier les logs du backend

Les logs du backend affichent les erreurs. Cherchez des messages comme :
- `Connection refused`
- `CORS error`
- `Database error`

### Solutions Courantes

#### Le backend ne démarre pas

**Erreur :** `cargo: command not found`
- **Solution :** Installer Rust : https://rustup.rs/

**Erreur :** `Failed to read config file`
- **Solution :** Créer `backend/config.toml` depuis `config.toml.example`

**Erreur :** `Database error`
- **Solution :** Vérifier que SQLite est installé et que le répertoire est accessible en écriture

#### Erreur CORS dans le navigateur

**Erreur :** `Access to fetch at 'http://localhost:8080/api/auth/register' from origin 'http://localhost:3000' has been blocked by CORS policy`

**Solutions :**
1. Vérifier que le backend est démarré
2. Vérifier que `cors_origins` dans `config.toml` contient l'URL du frontend
3. Redémarrer le backend après modification de `config.toml`
4. Vérifier que vous utilisez bien le proxy Vite (requêtes vers `/api` sont automatiquement proxyfiées)

#### Le frontend ne peut pas se connecter

**Erreur :** `Network Error` ou `ERR_CONNECTION_REFUSED`

**Solutions :**
1. Vérifier que le backend écoute sur le bon port (8080 par défaut)
2. Vérifier que le firewall ne bloque pas le port 8080
3. Essayer d'accéder directement à `http://localhost:8080/api/health` dans le navigateur
4. Vérifier que vous n'avez pas plusieurs instances du backend qui se battent pour le port

#### Erreur lors de la création de compte

**Erreur :** `Username already exists`
- **Solution :** Choisir un autre nom d'utilisateur

**Erreur :** `Password must be at least 8 characters`
- **Solution :** Utiliser un mot de passe d'au moins 8 caractères

**Erreur :** `Invalid input: role`
- **Solution :** Le rôle doit être `admin`, `operator`, ou `readonly` (en minuscules)

### Commandes Utiles

```bash
# Vérifier que le backend écoute sur le port 8080
netstat -an | grep 8080  # Linux/macOS
netstat -an | findstr 8080  # Windows

# Tester l'API directement
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test12345","role":"operator"}'

# Voir les logs du backend en temps réel
tail -f backend/krown.log  # Linux/macOS
Get-Content backend/krown.log -Wait  # Windows PowerShell
```

### Configuration du Proxy Vite

Le frontend utilise un proxy Vite configuré dans `frontend/vite.config.ts` :

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
}
```

Cela signifie que les requêtes vers `/api/*` sont automatiquement redirigées vers `http://localhost:8080/api/*`.

**Si le proxy ne fonctionne pas :**
1. Vérifier que Vite est bien démarré
2. Vérifier que le backend est accessible sur `http://localhost:8080`
3. Redémarrer le serveur de développement Vite

### Mode Développement vs Production

**Développement :**
- Frontend : `http://localhost:3000` (Vite dev server)
- Backend : `http://localhost:8080`
- Proxy Vite actif

**Production :**
- Frontend : Build statique (pas de proxy)
- Backend : `http://localhost:8080` ou URL de production
- CORS doit être configuré pour l'URL de production

### Obtenir de l'Aide

Si le problème persiste :
1. Vérifier les logs du backend (`backend/krown.log`)
2. Vérifier la console du navigateur (F12)
3. Vérifier que toutes les dépendances sont installées
4. Vérifier que les ports ne sont pas utilisés par d'autres applications

