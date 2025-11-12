# Correction rapide - Erreur Backend non accessible

## Le problème

L'erreur `ECONNREFUSED` signifie que le frontend essaie de se connecter au backend sur `http://localhost:8080`, mais le backend n'est pas démarré.

## Solution immédiate

### Option A : Démarrer le backend (si compilé)

Si vous avez déjà compilé le backend :

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
cargo run
```

Laissez ce terminal ouvert, puis dans un autre terminal :

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN
npm run dev:frontend
```

### Option B : Utiliser uniquement le frontend (temporaire)

Pour tester l'interface sans le backend :

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN
npm run dev:frontend-only
```

⚠️ L'inscription ne fonctionnera pas sans le backend.

### Option C : Installer les outils de build et compiler

1. **Installer Visual Studio Build Tools** :
   - https://visualstudio.microsoft.com/downloads/
   - "Build Tools pour Visual Studio"
   - Cocher "Développement Desktop en C++"

2. **Redémarrer PowerShell**

3. **Compiler et lancer** :
   ```powershell
   cd C:\Users\k.humbert.CYBER\Desktop\KROWN
   npm run install:backend
   npm run dev
   ```

## Vérification

Pour vérifier si le backend est accessible :

```powershell
curl http://localhost:8080/api/health
```

Ou ouvrez dans le navigateur : http://localhost:8080/api/health

Si vous voyez `{"status":"ok"}`, le backend fonctionne !

