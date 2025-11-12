#!/bin/bash
#
# Script pour générer la CA SSH
#

set -euo pipefail

CA_DIR="./ca"
CA_KEY="${CA_DIR}/ca_key"

if [ -f "$CA_KEY" ]; then
    echo "Warning: CA key already exists at $CA_KEY" >&2
    echo "Delete it first if you want to regenerate." >&2
    exit 1
fi

mkdir -p "$CA_DIR"

# Générer la clé CA (ed25519 recommandé pour la sécurité)
echo "Generating CA key..."
ssh-keygen -t ed25519 -f "$CA_KEY" -C "krown-ca" -N ""

# Afficher la clé publique pour référence
echo ""
echo "CA key generated successfully!"
echo "Public key:"
cat "${CA_KEY}.pub"
echo ""
echo "IMPORTANT: Keep $CA_KEY secure and never share it!"
echo "Set appropriate permissions: chmod 600 $CA_KEY"

