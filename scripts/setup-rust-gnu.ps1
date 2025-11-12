# Script pour configurer Rust avec le toolchain GNU (sans Visual Studio)
Write-Host "=== Configuration de Rust avec toolchain GNU ===" -ForegroundColor Cyan
Write-Host ""

# Ajouter Rust au PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Verifier que Rust est installe
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
    Write-Host "Rust n'est pas installe" -ForegroundColor Red
    Write-Host "Installez Rust depuis : https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installation du toolchain GNU..." -ForegroundColor Cyan
rustup toolchain install stable-x86_64-pc-windows-gnu

Write-Host "Configuration du toolchain GNU par defaut..." -ForegroundColor Cyan
rustup default stable-x86_64-pc-windows-gnu

Write-Host ""
Write-Host "Installation de MinGW-w64 (necessaire pour le linker GNU)..." -ForegroundColor Cyan
Write-Host "Si MinGW n'est pas installe, vous pouvez :" -ForegroundColor Yellow
Write-Host "1. Installer via Chocolatey: choco install mingw" -ForegroundColor Cyan
Write-Host "2. Ou telecharger depuis : https://www.mingw-w64.org/downloads/" -ForegroundColor Cyan
Write-Host ""

# Verifier si MinGW est installe
$mingwPaths = @(
    "C:\mingw64\bin",
    "C:\msys64\mingw64\bin",
    "$env:ProgramFiles\mingw-w64\*\mingw64\bin"
)

$mingwFound = $false
foreach ($path in $mingwPaths) {
    $resolved = Resolve-Path $path -ErrorAction SilentlyContinue
    if ($resolved) {
        $gccPath = Join-Path $resolved "gcc.exe"
        if (Test-Path $gccPath) {
            Write-Host "MinGW trouve : $resolved" -ForegroundColor Green
            $env:PATH += ";$resolved"
            $mingwFound = $true
            break
        }
    }
}

if (-not $mingwFound) {
    Write-Host "MinGW n'est pas trouve dans les emplacements standards" -ForegroundColor Yellow
    Write-Host "Vous devrez peut-etre l'installer manuellement" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Configuration terminee ===" -ForegroundColor Cyan
Write-Host "Vous pouvez maintenant compiler le backend avec :" -ForegroundColor Green
Write-Host "  cargo build" -ForegroundColor White
Write-Host ""

