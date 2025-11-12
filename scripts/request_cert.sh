#!/bin/bash
#
# Script pour demander un certificat SSH au service de signature
#

set -euo pipefail

SIGNING_SERVICE_URL="${SIGNING_SERVICE_URL:-http://localhost:8080}"
KEY_FILE="${1:-${HOME}/.ssh/id_ed25519}"
USERNAME="${2:-${USER}}"
PRINCIPALS="${3:-${USERNAME}}"
TTL_SECONDS="${4:-600}"

# Vérifier que la clé existe
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: Key file not found: $KEY_FILE" >&2
    echo "Usage: $0 [key_file] [username] [principals] [ttl_seconds]" >&2
    exit 1
fi

# Lire la clé publique
PUBKEY=$(cat "${KEY_FILE}.pub")

# Préparer la requête JSON
PAYLOAD=$(cat <<EOF
{
  "pubkey": "${PUBKEY}",
  "username": "${USERNAME}",
  "principals": ["${PRINCIPALS}"],
  "ttl_seconds": ${TTL_SECONDS}
}
EOF
)

# Envoyer la requête
echo "Requesting certificate from ${SIGNING_SERVICE_URL}/sign..."
RESPONSE=$(curl -s -X POST "${SIGNING_SERVICE_URL}/sign" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# Vérifier si curl a réussi
if [ $? -ne 0 ]; then
    echo "Error: Failed to connect to signing service" >&2
    exit 1
fi

# Extraire le certificat et la date d'expiration
# Essayer d'utiliser jq si disponible, sinon utiliser grep/sed
if command -v jq >/dev/null 2>&1; then
    CERT=$(echo "$RESPONSE" | jq -r '.cert' | sed 's/\\n/\n/g')
    EXPIRES_AT=$(echo "$RESPONSE" | jq -r '.expires_at')
    
    # Vérifier les erreurs
    if [ "$CERT" = "null" ] || [ -z "$CERT" ]; then
        ERROR_MSG=$(echo "$RESPONSE" | jq -r '.detail // .error // "Unknown error"')
        echo "Error: Failed to get certificate: $ERROR_MSG" >&2
        echo "Response: $RESPONSE" >&2
        exit 1
    fi
else
    # Fallback: parsing basique avec grep/sed
    CERT=$(echo "$RESPONSE" | grep -o '"cert":"[^"]*"' | sed 's/"cert":"\([^"]*\)"/\1/' | sed 's/\\n/\n/g')
    EXPIRES_AT=$(echo "$RESPONSE" | grep -o '"expires_at":"[^"]*"' | sed 's/"expires_at":"\([^"]*\)"/\1/')
    
    if [ -z "$CERT" ] || [ "$CERT" = "null" ]; then
        echo "Error: Failed to get certificate from response" >&2
        echo "Response: $RESPONSE" >&2
        echo "Hint: Install 'jq' for better JSON parsing" >&2
        exit 1
    fi
fi

# Écrire le certificat
CERT_FILE="${KEY_FILE}-cert.pub"
echo "$CERT" > "$CERT_FILE"
chmod 644 "$CERT_FILE"

echo "Certificate saved to: $CERT_FILE"
echo "Expires at: $EXPIRES_AT"
echo ""
echo "You can now use this certificate with SSH:"
echo "  ssh -i $KEY_FILE -J bastion.example.com user@target.example.com"

