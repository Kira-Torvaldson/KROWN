# Démarrage du Backend Krown

## ⚠️ Erreur : Backend non accessible

Si vous voyez l'erreur `ECONNREFUSED` ou `http proxy error`, cela signifie que le backend n'est pas démarré.

## Solution 1 : Installer les outils de build (Recommandé)

Le backend Rust nécessite les outils de build Visual Studio sur Windows.

### Installation rapide

1. **Télécharger Visual Studio Build Tools** :
   - Allez sur : https://visualstudio.microsoft.com/downloads/
   - Section "Outils pour Visual Studio"
   - Cliquez sur "Build Tools pour Visual Studio"

2. **Installer** :
   - Exécutez l'installateur
   - **Cochez "Développement Desktop en C++"** (important !)
   - Cliquez sur "Installer"
   - Attendez la fin de l'installation (peut prendre 10-15 minutes)

3. **Redémarrer PowerShell** après l'installation

4. **Compiler et lancer le backend** :
   ```powershell
   cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
   cargo build
   cargo run
   ```

## Solution 2 : Utiliser uniquement le frontend (temporaire)

Si vous voulez juste tester le frontend sans le backend :

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN
npm run install:frontend
npm run dev:frontend
```

⚠️ **Note** : Sans le backend, l'inscription et la connexion ne fonctionneront pas.

## Solution 3 : Alternative GNU (si vous ne voulez pas Visual Studio)

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu
rustup default stable-x86_64-pc-windows-gnu
cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
cargo build
cargo run
```

## Vérifier que le backend est démarré

Une fois le backend lancé, vous devriez voir :

```
Starting Krown Backend...
Configuration loaded from config.toml
Database initialized and migrated
Starting API server on 0.0.0.0:8080
```

Testez l'endpoint de santé :
```powershell
curl http://localhost:8080/api/health
```

Ou dans le navigateur : http://localhost:8080/api/health

Vous devriez recevoir : `{"status":"ok"}`

## Scripts utiles

- `.\scripts\check-backend.ps1` - Vérifie si le backend est accessible
- `.\scripts\run-backend.ps1` - Lance le backend
- `.\scripts\install-backend.ps1` - Compile le backend

## Dépannage

### "link.exe not found"
→ Installez Visual Studio Build Tools avec "Développement Desktop en C++"

### "cargo: command not found"
→ Exécutez `.\SETUP_RUST.ps1` ou redémarrez PowerShell

### "Port 8080 already in use"
→ Un autre processus utilise le port 8080. Arrêtez-le ou changez le port dans `backend/config.toml`

### Le backend démarre mais le frontend ne se connecte pas
→ Vérifiez que `cors_origins` dans `backend/config.toml` contient `http://localhost:3000`

