# Installation de Rust sur Windows

## Méthode 1 : Installateur officiel (Recommandé)

1. **Télécharger rustup-init.exe** :
   - Allez sur : https://rustup.rs/
   - Cliquez sur "Download rustup-init.exe"
   - Ou téléchargez directement : https://win.rustup.rs/x86_64

2. **Exécuter l'installateur** :
   ```powershell
   # Télécharger
   Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
   
   # Exécuter
   .\rustup-init.exe
   ```

3. **Suivre les instructions** :
   - Appuyez sur `Enter` pour accepter l'installation par défaut
   - L'installation prendra quelques minutes

4. **Redémarrer le terminal** :
   - Fermez et rouvrez PowerShell/CMD
   - Ou exécutez : `refreshenv` (si vous utilisez Chocolatey)

5. **Vérifier l'installation** :
   ```powershell
   cargo --version
   rustc --version
   ```

## Méthode 2 : Via Chocolatey (si installé)

```powershell
choco install rust
```

## Méthode 3 : Via Scoop (si installé)

```powershell
scoop install rust
```

## Après l'installation

1. **Vérifier que Rust est dans le PATH** :
   ```powershell
   $env:PATH -split ';' | Select-String rust
   ```

2. **Si Rust n'est pas trouvé** :
   - Ajoutez manuellement au PATH : `C:\Users\VOTRE_USER\.cargo\bin`
   - Ou redémarrez complètement votre ordinateur

3. **Compiler le backend** :
   ```powershell
   cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
   cargo build
   ```

## Dépannage

### "cargo: command not found" après installation

1. Vérifiez que le répertoire est dans le PATH :
   ```powershell
   $env:PATH
   ```
   Devrait contenir : `C:\Users\VOTRE_USER\.cargo\bin`

2. Si absent, ajoutez-le temporairement :
   ```powershell
   $env:PATH += ";C:\Users\$env:USERNAME\.cargo\bin"
   ```

3. Ou ajoutez-le de façon permanente :
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\$env:USERNAME\.cargo\bin", "User")
   ```

### Erreur lors de l'installation

- Vérifiez que vous avez les droits administrateur
- Vérifiez votre connexion Internet
- Essayez de désactiver temporairement votre antivirus

## Vérification complète

```powershell
# Vérifier Rust
rustc --version
# Devrait afficher : rustc 1.xx.x (xxxxx xxxx-xx-xx)

# Vérifier Cargo
cargo --version
# Devrait afficher : cargo 1.xx.x (xxxxx xxxx-xx-xx)

# Vérifier que tout fonctionne
cargo new test_project
cd test_project
cargo build
cd ..
Remove-Item -Recurse -Force test_project
```

Une fois Rust installé, vous pourrez compiler et exécuter le backend Krown.

