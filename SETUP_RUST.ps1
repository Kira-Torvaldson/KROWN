# Script pour configurer Rust dans PowerShell
# Exécutez ce script une fois pour ajouter Rust au PATH

Write-Host "=== Configuration de Rust pour Krown ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Rust est installé
$cargoPath = "$env:USERPROFILE\.cargo\bin\cargo.exe"
if (Test-Path $cargoPath) {
    Write-Host "✓ Rust est installé" -ForegroundColor Green
} else {
    Write-Host "✗ Rust n'est pas installé" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour installer Rust :" -ForegroundColor Yellow
    Write-Host "1. Téléchargez depuis : https://rustup.rs/" -ForegroundColor Cyan
    Write-Host "2. Ou exécutez :" -ForegroundColor Cyan
    Write-Host "   Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe" -ForegroundColor White
    Write-Host "   .\rustup-init.exe" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Ajouter au PATH de la session actuelle
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
Write-Host "✓ Rust ajouté au PATH de cette session" -ForegroundColor Green

# Vérifier que cargo fonctionne
try {
    $version = cargo --version 2>&1
    Write-Host "✓ Cargo fonctionne : $version" -ForegroundColor Green
} catch {
    Write-Host "✗ Cargo ne fonctionne pas" -ForegroundColor Red
    exit 1
}

# Ajouter au PATH de façon permanente
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$env:USERPROFILE\.cargo\bin*") {
    [Environment]::SetEnvironmentVariable("Path", $currentPath + ";$env:USERPROFILE\.cargo\bin", "User")
    Write-Host "✓ Rust ajouté au PATH de façon permanente" -ForegroundColor Green
    Write-Host "⚠ Redémarrez PowerShell pour que le changement prenne effet partout" -ForegroundColor Yellow
} else {
    Write-Host "✓ Rust est déjà dans le PATH permanent" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Configuration terminée ===" -ForegroundColor Cyan
Write-Host "Vous pouvez maintenant utiliser :" -ForegroundColor Green
Write-Host "  cargo build" -ForegroundColor White
Write-Host "  cargo run" -ForegroundColor White
Write-Host ""

