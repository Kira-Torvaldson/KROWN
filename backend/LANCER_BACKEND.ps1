# Script pour lancer le backend Krown
# Exécutez ce script depuis le répertoire backend

Write-Host "=== Lancement du Backend Krown ===" -ForegroundColor Cyan
Write-Host ""

# Ajouter Rust au PATH si nécessaire
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $env:PATH += ";$env:USERPROFILE\.cargo\bin"
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Host "✗ Rust/Cargo n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
        Write-Host "→ Installez Rust depuis : https://rustup.rs/" -ForegroundColor Yellow
        exit 1
    }
}

# Vérifier la configuration
if (-not (Test-Path "config.toml")) {
    Write-Host "⚠ config.toml n'existe pas" -ForegroundColor Yellow
    if (Test-Path "config.toml.example") {
        Write-Host "→ Copie de config.toml.example vers config.toml..." -ForegroundColor Cyan
        Copy-Item "config.toml.example" "config.toml"
        Write-Host "✓ config.toml créé" -ForegroundColor Green
        Write-Host "⚠ N'oubliez pas de configurer le JWT_SECRET dans config.toml !" -ForegroundColor Yellow
    } else {
        Write-Host "✗ config.toml.example n'existe pas" -ForegroundColor Red
        exit 1
    }
}

# Compiler si nécessaire
if (-not (Test-Path "target\debug\krown-backend.exe") -and -not (Test-Path "target\release\krown-backend.exe")) {
    Write-Host "Compilation du backend..." -ForegroundColor Cyan
    cargo build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Échec de la compilation" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Compilation réussie" -ForegroundColor Green
    Write-Host ""
}

# Lancer le backend
Write-Host "Démarrage du serveur backend..." -ForegroundColor Cyan
Write-Host "Le serveur sera accessible sur http://localhost:8080" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Yellow
Write-Host ""

cargo run

