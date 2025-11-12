# Installation manuelle de MinGW-w64

## Option 1 : Téléchargement direct (Recommandé)

### Étape 1 : Télécharger MinGW-w64

1. Allez sur : https://winlibs.com/
2. Téléchargez la version **"Release"** pour **x86_64** (64-bit)
3. Ou directement : https://github.com/brechtsanders/winlibs_mingw/releases
4. Téléchargez le fichier ZIP (ex: `winlibs-x86_64-posix-seh-gcc-13.2.0-mingw-w64ucrt-11.0.1-r1.zip`)

### Étape 2 : Extraire

1. Créez un dossier `C:\mingw64` (ou un autre emplacement de votre choix)
2. Extrayez le contenu du ZIP dans ce dossier
3. Vous devriez avoir `C:\mingw64\bin\gcc.exe`

### Étape 3 : Ajouter au PATH

**Méthode 1 : Via PowerShell (temporaire pour cette session)**
```powershell
$env:PATH += ";C:\mingw64\bin"
```

**Méthode 2 : Permanent (via l'interface Windows)**
1. Appuyez sur `Win + R`
2. Tapez `sysdm.cpl` et appuyez sur Entrée
3. Onglet "Avancé" → "Variables d'environnement"
4. Dans "Variables système" ou "Variables utilisateur", sélectionnez "Path"
5. Cliquez sur "Modifier"
6. Cliquez sur "Nouveau"
7. Ajoutez : `C:\mingw64\bin`
8. Cliquez sur "OK" partout
9. **Redémarrez PowerShell**

### Étape 4 : Vérifier

```powershell
gcc --version
```

Vous devriez voir la version de GCC.

## Option 2 : MSYS2 (Plus complet)

### Étape 1 : Installer MSYS2

1. Téléchargez depuis : https://www.msys2.org/
2. Installez dans `C:\msys64` (par défaut)
3. Lancez MSYS2 depuis le menu Démarrer

### Étape 2 : Installer MinGW dans MSYS2

Dans le terminal MSYS2, exécutez :

```bash
pacman -Syu
pacman -S mingw-w64-x86_64-gcc
```

### Étape 3 : Ajouter au PATH Windows

Ajoutez `C:\msys64\mingw64\bin` au PATH (voir Option 1, Étape 3)

### Étape 4 : Vérifier

```powershell
gcc --version
```

## Après l'installation de MinGW

Une fois MinGW installé et dans le PATH :

1. **Configurer Rust pour utiliser GNU** :
   ```powershell
   rustup toolchain install stable-x86_64-pc-windows-gnu
   rustup default stable-x86_64-pc-windows-gnu
   ```

2. **Vérifier** :
   ```powershell
   rustc --version
   ```
   Devrait afficher `x86_64-pc-windows-gnu`

3. **Compiler le backend** :
   ```powershell
   cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
   cargo build
   ```

## Vérification complète

```powershell
# Vérifier GCC
gcc --version

# Vérifier Rust
rustc --version
# Devrait contenir "x86_64-pc-windows-gnu"

# Vérifier Cargo
cargo --version

# Compiler
cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
cargo build
```

## Dépannage

### "gcc: command not found"
→ MinGW n'est pas dans le PATH. Vérifiez l'étape 3.

### "linker `cc` not found"
→ MinGW n'est pas installé ou n'est pas dans le PATH.

### Le toolchain GNU ne fonctionne toujours pas
→ Redémarrez complètement PowerShell après avoir ajouté MinGW au PATH.

