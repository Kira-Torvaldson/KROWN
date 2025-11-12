# Script PowerShell pour installer le backend
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Rust/Cargo n'est pas installe ou n'est pas dans le PATH" -ForegroundColor Yellow
    Write-Host "Installez Rust depuis : https://rustup.rs/" -ForegroundColor Cyan
    Write-Host "Ou executez : .\SETUP_RUST.ps1" -ForegroundColor Cyan
    exit 0
}

# Verifier le toolchain actuel
$currentToolchain = rustup show | Select-String "Default host" | ForEach-Object { $_.Line -replace '.*Default host: ', '' }

if ($currentToolchain -notlike "*gnu*") {
    Write-Host "Le toolchain MSVC est configure mais les outils de build sont manquants" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options :" -ForegroundColor Cyan
    Write-Host "1. Installer Visual Studio Build Tools (recommandé pour Windows)" -ForegroundColor White
    Write-Host "   https://visualstudio.microsoft.com/downloads/" -ForegroundColor Gray
    Write-Host "   -> Build Tools -> Cocher 'Developpement Desktop en C++'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Utiliser le toolchain GNU (alternative, plus léger)" -ForegroundColor White
    Write-Host "   .\scripts\setup-rust-gnu.ps1" -ForegroundColor Gray
    Write-Host "   (Nécessite MinGW-w64)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Voulez-vous configurer le toolchain GNU maintenant ? (O/N)" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
        & "$PSScriptRoot\setup-rust-gnu.ps1"
    } else {
        Write-Host "Installation annulee. Installez Visual Studio Build Tools pour continuer." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Compilation du backend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\backend"
cargo build
if ($LASTEXITCODE -eq 0) {
    Write-Host "Backend compile avec succes" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Echec de la compilation" -ForegroundColor Red
    Write-Host ""
    Write-Host "Si vous voyez 'link.exe not found', vous devez :" -ForegroundColor Yellow
    Write-Host "- Installer Visual Studio Build Tools, OU" -ForegroundColor Cyan
    Write-Host "- Configurer le toolchain GNU avec MinGW" -ForegroundColor Cyan
    exit 1
}

