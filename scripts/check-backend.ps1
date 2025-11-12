# Script pour verifier si le backend est demarre
$backendUrl = "http://localhost:8080/api/health"

try {
    $response = Invoke-WebRequest -Uri $backendUrl -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend est demarre et accessible" -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "Backend n'est pas accessible sur http://localhost:8080" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour demarrer le backend :" -ForegroundColor Yellow
    Write-Host "1. Installez Visual Studio Build Tools (necessaire pour compiler Rust)" -ForegroundColor Cyan
    Write-Host "   https://visualstudio.microsoft.com/downloads/" -ForegroundColor Cyan
    Write-Host "   -> Outils pour Visual Studio -> Build Tools" -ForegroundColor Cyan
    Write-Host "   -> Cocher 'Developpement Desktop en C++'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Puis compilez et lancez le backend :" -ForegroundColor Yellow
    Write-Host "   cd backend" -ForegroundColor White
    Write-Host "   cargo build" -ForegroundColor White
    Write-Host "   cargo run" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou utilisez le script :" -ForegroundColor Yellow
    Write-Host "   .\scripts\run-backend.ps1" -ForegroundColor White
    exit 1
}

