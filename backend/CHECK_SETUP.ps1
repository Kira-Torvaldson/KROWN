# Script de vérification de l'installation - Krown Backend
# Exécutez ce script pour vérifier que tout est prêt

Write-Host "=== Vérification de l'installation Krown Backend ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier Rust
Write-Host "1. Vérification de Rust..." -ForegroundColor Yellow
try {
    $rustVersion = cargo --version 2>&1
    Write-Host "   ✓ Rust installé : $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Rust n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   → Installez Rust depuis : https://rustup.rs/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Vérifier Cargo
Write-Host "2. Vérification de Cargo..." -ForegroundColor Yellow
try {
    $cargoVersion = cargo --version 2>&1
    Write-Host "   ✓ Cargo installé : $cargoVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Cargo n'est pas disponible" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Vérifier le fichier de configuration
Write-Host "3. Vérification de la configuration..." -ForegroundColor Yellow
if (Test-Path "config.toml") {
    Write-Host "   ✓ config.toml existe" -ForegroundColor Green
} else {
    Write-Host "   ⚠ config.toml n'existe pas" -ForegroundColor Yellow
    if (Test-Path "config.toml.example") {
        Write-Host "   → Copiez config.toml.example vers config.toml" -ForegroundColor Yellow
        Copy-Item "config.toml.example" "config.toml"
        Write-Host "   ✓ config.toml créé depuis config.toml.example" -ForegroundColor Green
    } else {
        Write-Host "   ✗ config.toml.example n'existe pas non plus" -ForegroundColor Red
    }
}

# Vérifier les dépendances
Write-Host "4. Vérification des dépendances..." -ForegroundColor Yellow
if (Test-Path "Cargo.toml") {
    Write-Host "   ✓ Cargo.toml existe" -ForegroundColor Green
} else {
    Write-Host "   ✗ Cargo.toml n'existe pas" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Vérifier la base de données
Write-Host "5. Vérification de la base de données..." -ForegroundColor Yellow
if (Test-Path "krown.db") {
    Write-Host "   ✓ Base de données existe" -ForegroundColor Green
} else {
    Write-Host "   ℹ Base de données sera créée au premier démarrage" -ForegroundColor Cyan
}

# Vérifier les logs
Write-Host "6. Vérification des logs..." -ForegroundColor Yellow
if (Test-Path "krown.log") {
    $logSize = (Get-Item "krown.log").Length
    Write-Host "   ✓ Fichier de log existe ($logSize octets)" -ForegroundColor Green
    Write-Host "   → Dernières lignes du log :" -ForegroundColor Cyan
    Get-Content "krown.log" -Tail 5 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
} else {
    Write-Host "   ℹ Fichier de log sera créé au démarrage" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Résumé ===" -ForegroundColor Cyan
Write-Host "Si toutes les vérifications sont OK, vous pouvez lancer :" -ForegroundColor Green
Write-Host "  cargo run" -ForegroundColor White
Write-Host ""

