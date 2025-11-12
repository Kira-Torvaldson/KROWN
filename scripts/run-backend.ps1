# Script PowerShell pour lancer le backend
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Set-Location "$PSScriptRoot\..\backend"
    cargo run
} else {
    Write-Host "Rust/Cargo n'est pas installe ou n'est pas dans le PATH" -ForegroundColor Yellow
    Write-Host "Installez Rust depuis : https://rustup.rs/" -ForegroundColor Cyan
    Write-Host "Ou executez : .\SETUP_RUST.ps1" -ForegroundColor Cyan
    Start-Sleep -Seconds 10
}

