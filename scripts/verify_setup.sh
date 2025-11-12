#!/bin/bash
#
# Script de vérification de l'installation Krown
#

set -euo pipefail

ERRORS=0
WARNINGS=0

echo "=== Vérification de l'installation Krown ==="
echo ""

# Vérifier les dépendances système
echo "1. Vérification des dépendances système..."

check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        echo "  ✓ $1 trouvé"
        return 0
    else
        echo "  ✗ $1 manquant"
        return 1
    fi
}

check_command ssh || ((ERRORS++))
check_command ssh-keygen || ((ERRORS++))
check_command python3 || ((ERRORS++))
check_command curl || ((ERRORS++))

if check_command ttyrec; then
    echo "  ✓ ttyrec trouvé (enregistrement de sessions)"
else
    echo "  ⚠ ttyrec manquant (les sessions ne pourront pas être enregistrées)"
    ((WARNINGS++))
fi

if check_command jq; then
    echo "  ✓ jq trouvé (parsing JSON amélioré)"
else
    echo "  ⚠ jq manquant (recommandé pour scripts/request_cert.sh)"
    ((WARNINGS++))
fi

echo ""

# Vérifier les dépendances Python
echo "2. Vérification des dépendances Python..."

if python3 -c "import fastapi, uvicorn, pydantic, requests" 2>/dev/null; then
    echo "  ✓ Toutes les dépendances Python sont installées"
else
    echo "  ✗ Dépendances Python manquantes"
    echo "    Exécutez: pip3 install -r requirements.txt"
    ((ERRORS++))
fi

echo ""

# Vérifier la structure du projet
echo "3. Vérification de la structure du projet..."

check_file() {
    if [ -f "$1" ]; then
        echo "  ✓ $1 existe"
        return 0
    else
        echo "  ✗ $1 manquant"
        return 1
    fi
}

check_file signing_service.py || ((ERRORS++))
check_file krown-proxy-wrapper || ((ERRORS++))
check_file scripts/generate_ca.sh || ((ERRORS++))
check_file scripts/request_cert.sh || ((ERRORS++))
check_file scripts/request_cert.py || ((ERRORS++))

echo ""

# Vérifier la CA
echo "4. Vérification de la CA..."

if [ -f "./ca/ca_key" ] && [ -f "./ca/ca_key.pub" ]; then
    echo "  ✓ CA générée"
    if [ "$(stat -c %a ./ca/ca_key 2>/dev/null || stat -f %A ./ca/ca_key 2>/dev/null)" = "600" ]; then
        echo "  ✓ Permissions CA correctes (600)"
    else
        echo "  ⚠ Permissions CA incorrectes (devrait être 600)"
        echo "    Exécutez: chmod 600 ./ca/ca_key"
        ((WARNINGS++))
    fi
else
    echo "  ⚠ CA non générée"
    echo "    Exécutez: ./scripts/generate_ca.sh"
    ((WARNINGS++))
fi

echo ""

# Vérifier les dossiers
echo "5. Vérification des dossiers..."

for dir in archive logs; do
    if [ -d "./$dir" ]; then
        echo "  ✓ ./$dir/ existe"
    else
        echo "  ⚠ ./$dir/ n'existe pas (sera créé automatiquement)"
        ((WARNINGS++))
    fi
done

echo ""

# Vérifier les permissions des scripts
echo "6. Vérification des permissions des scripts..."

for script in krown-proxy-wrapper scripts/*.sh scripts/*.py; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo "  ✓ $script est exécutable"
        else
            echo "  ⚠ $script n'est pas exécutable"
            echo "    Exécutez: chmod +x $script"
            ((WARNINGS++))
        fi
    fi
done

echo ""

# Résumé
echo "=== Résumé ==="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ Installation complète et correcte !"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "✓ Installation fonctionnelle avec $WARNINGS avertissement(s)"
    exit 0
else
    echo "✗ Installation incomplète : $ERRORS erreur(s), $WARNINGS avertissement(s)"
    exit 1
fi

