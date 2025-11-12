#!/bin/bash
#
# Exemple de connexion via le bastion avec certificat
#

set -euo pipefail

BASTION="${1:-bastion.example.com}"
TARGET="${2:-target.example.com}"
TARGET_USER="${3:-${USER}}"
KEY_FILE="${4:-${HOME}/.ssh/id_ed25519}"

# Vérifier que le certificat existe
CERT_FILE="${KEY_FILE}-cert.pub"
if [ ! -f "$CERT_FILE" ]; then
    echo "Error: Certificate not found: $CERT_FILE" >&2
    echo "Please request a certificate first using scripts/request_cert.sh" >&2
    exit 1
fi

echo "Connecting to ${TARGET_USER}@${TARGET} via ${BASTION}..."
echo "Using certificate: $CERT_FILE"
echo ""

# Connexion SSH avec ProxyJump et certificat
ssh -i "$KEY_FILE" \
    -o ProxyJump="${BASTION}" \
    -o CertificateFile="$CERT_FILE" \
    -o StrictHostKeyChecking=no \
    "${TARGET_USER}@${TARGET}"

