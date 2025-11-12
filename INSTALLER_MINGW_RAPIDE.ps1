# Script pour installer MinGW rapidement
Write-Host "=== Installation rapide de MinGW ===" -ForegroundColor Cyan
Write-Host ""

# Verifier si MinGW est deja installe
if (Get-Command gcc -ErrorAction SilentlyContinue) {
    Write-Host "MinGW est deja installe :" -ForegroundColor Green
    gcc --version
    exit 0
}

Write-Host "MinGW n'est pas installe." -ForegroundColor Yellow
Write-Host ""
Write-Host "Options d'installation :" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. TELECHARGEMENT DIRECT (Recommandé - 5 minutes)" -ForegroundColor White
Write-Host "   - Allez sur : https://winlibs.com/" -ForegroundColor Gray
Write-Host "   - Téléchargez : winlibs-x86_64-posix-seh-gcc-13.2.0-mingw-w64ucrt-11.0.1-r1.zip" -ForegroundColor Gray
Write-Host "   - Extrayez dans : C:\mingw64" -ForegroundColor Gray
Write-Host "   - Ajoutez C:\mingw64\bin au PATH" -ForegroundColor Gray
Write-Host ""
Write-Host "2. MSYS2 (Plus complet - 10 minutes)" -ForegroundColor White
Write-Host "   - Téléchargez : https://www.msys2.org/" -ForegroundColor Gray
Write-Host "   - Installez dans C:\msys64" -ForegroundColor Gray
Write-Host "   - Dans MSYS2 : pacman -S mingw-w64-x86_64-gcc" -ForegroundColor Gray
Write-Host "   - Ajoutez C:\msys64\mingw64\bin au PATH" -ForegroundColor Gray
Write-Host ""
Write-Host "3. TELECHARGEMENT AUTOMATIQUE (Essai)" -ForegroundColor White
Write-Host "   Voulez-vous que j'essaie de télécharger MinGW automatiquement ? (O/N)" -ForegroundColor Yellow
$response = Read-Host

if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "Téléchargement de MinGW depuis winlibs.com..." -ForegroundColor Cyan
    
    $mingwDir = "C:\mingw64"
    $tempZip = "$env:TEMP\mingw64.zip"
    $downloadUrl = "https://github.com/brechtsanders/winlibs_mingw/releases/download/13.2.0-11.0.1-ucrt-r1/winlibs-x86_64-posix-seh-gcc-13.2.0-mingw-w64ucrt-11.0.1-r1.zip"
    
    try {
        Write-Host "Téléchargement en cours..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
        
        if (Test-Path $mingwDir) {
            Write-Host "Le dossier $mingwDir existe déjà. Suppression..." -ForegroundColor Yellow
            Remove-Item -Recurse -Force $mingwDir
        }
        
        Write-Host "Extraction..." -ForegroundColor Yellow
        Expand-Archive -Path $tempZip -DestinationPath "C:\" -Force
        
        # Le ZIP contient un dossier mingw64, on doit le déplacer si nécessaire
        if (Test-Path "C:\winlibs-x86_64-posix-seh-gcc-13.2.0-mingw-w64ucrt-11.0.1-r1") {
            Move-Item "C:\winlibs-x86_64-posix-seh-gcc-13.2.0-mingw-w64ucrt-11.0.1-r1" $mingwDir -Force
        }
        
        # Ajouter au PATH de cette session
        $env:PATH += ";$mingwDir\bin"
        
        # Ajouter au PATH permanent
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($currentPath -notlike "*$mingwDir\bin*") {
            [Environment]::SetEnvironmentVariable("Path", $currentPath + ";$mingwDir\bin", "User")
            Write-Host "MinGW ajoute au PATH permanent" -ForegroundColor Green
        }
        
        # Verifier
        if (Get-Command gcc -ErrorAction SilentlyContinue) {
            Write-Host ""
            Write-Host "MinGW installe avec succes !" -ForegroundColor Green
            gcc --version
            Write-Host ""
            Write-Host "Redemarrez PowerShell pour que le PATH soit mis a jour partout" -ForegroundColor Yellow
        } else {
            Write-Host "MinGW installe mais gcc n'est pas trouve. Verifiez le PATH." -ForegroundColor Yellow
        }
        
        Remove-Item $tempZip -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Erreur lors du telechargement : $_" -ForegroundColor Red
        Write-Host "Installez MinGW manuellement (voir Option 1 ci-dessus)" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Installez MinGW manuellement en suivant l'Option 1 ou 2 ci-dessus." -ForegroundColor Cyan
    Write-Host "Voir INSTALL_MINGW_MANUAL.md pour les details complets." -ForegroundColor Cyan
}

