# Solution Rapide - Erreur "link.exe not found"

## Le problème

Rust essaie d'utiliser le linker MSVC (`link.exe`) mais Visual Studio Build Tools n'est pas installé.

## Solution la plus rapide : Toolchain GNU

### Étape 1 : Installer MinGW via Chocolatey (si installé)

```powershell
choco install mingw
```

### Étape 2 : Configurer Rust pour utiliser GNU

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN
.\scripts\setup-rust-gnu.ps1
```

### Étape 3 : Compiler le backend

```powershell
cd backend
cargo build
```

## Alternative : Installer Visual Studio Build Tools

Si vous préférez utiliser MSVC (recommandé pour Windows) :

1. **Télécharger** : https://visualstudio.microsoft.com/downloads/
2. **Section "Outils pour Visual Studio"** → "Build Tools"
3. **Cocher "Développement Desktop en C++"**
4. **Installer** (10-15 minutes)
5. **Redémarrer PowerShell**
6. **Compiler** : `cargo build`

## Vérification

Après configuration, vérifiez :

```powershell
rustc --version
cargo --version
```

Si vous voyez `x86_64-pc-windows-gnu` dans la sortie, le toolchain GNU est actif.

## Compiler et lancer

```powershell
cd C:\Users\k.humbert.CYBER\Desktop\KROWN\backend
cargo build
cargo run
```

Le backend devrait maintenant compiler sans erreur !

