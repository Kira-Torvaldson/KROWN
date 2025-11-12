# Installation de MinGW-w64 pour Rust (Alternative à Visual Studio)

## Pourquoi MinGW ?

Si vous ne voulez pas installer Visual Studio Build Tools (qui est volumineux), vous pouvez utiliser le toolchain GNU de Rust avec MinGW-w64.

## Installation rapide

### Option 1 : Via Chocolatey (Recommandé)

Si vous avez Chocolatey installé :

```powershell
choco install mingw
```

Puis configurez Rust pour utiliser GNU :

```powershell
.\scripts\setup-rust-gnu.ps1
```

### Option 2 : Téléchargement manuel

1. **Télécharger MinGW-w64** :
   - Allez sur : https://www.mingw-w64.org/downloads/
   - Ou directement : https://sourceforge.net/projects/mingw-w64/files/
   - Téléchargez la version pour Windows (x86_64)

2. **Installer** :
   - Extrayez dans `C:\mingw64` (ou un autre répertoire)
   - Ajoutez `C:\mingw64\bin` au PATH

3. **Configurer Rust** :
   ```powershell
   rustup toolchain install stable-x86_64-pc-windows-gnu
   rustup default stable-x86_64-pc-windows-gnu
   ```

### Option 3 : Via MSYS2 (Recommandé pour développement)

1. **Installer MSYS2** :
   - Téléchargez depuis : https://www.msys2.org/
   - Installez dans `C:\msys64`

2. **Installer MinGW dans MSYS2** :
   ```bash
   # Dans le terminal MSYS2
   pacman -S mingw-w64-x86_64-gcc
   ```

3. **Ajouter au PATH** :
   Ajoutez `C:\msys64\mingw64\bin` au PATH Windows

4. **Configurer Rust** :
   ```powershell
   rustup toolchain install stable-x86_64-pc-windows-gnu
   rustup default stable-x86_64-pc-windows-gnu
   ```

## Vérification

Après installation, vérifiez :

```powershell
gcc --version
rustc --version
cargo --version
```

## Compiler le backend

Une fois MinGW installé et Rust configuré :

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
cargo build
```

## Avantages de MinGW vs Visual Studio

- ✅ Plus léger (quelques centaines de MB vs plusieurs GB)
- ✅ Installation plus rapide
- ✅ Pas besoin de redémarrer l'ordinateur
- ✅ Compatible avec la plupart des projets Rust

## Inconvénients

- ⚠️ Certaines dépendances natives peuvent nécessiter MSVC
- ⚠️ Les binaires compilés avec MinGW peuvent être légèrement plus gros

## Recommandation

Pour Krown, MinGW fonctionne très bien. Utilisez l'Option 1 (Chocolatey) ou l'Option 3 (MSYS2) pour une installation propre.

