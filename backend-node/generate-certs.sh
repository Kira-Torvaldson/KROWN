#!/bin/bash
# Script pour générer des certificats SSL auto-signés pour le développement

CERT_DIR="certs"

# Créer le répertoire si nécessaire
mkdir -p "$CERT_DIR"

# Générer le certificat auto-signé
openssl req -x509 -newkey rsa:4096 \
    -nodes \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -days 365 \
    -subj "/C=FR/ST=State/L=City/O=Krown/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"

echo "✓ Certificats générés dans $CERT_DIR/"
echo "  - cert.pem (certificat)"
echo "  - key.pem (clé privée)"
echo ""
echo "⚠️  Ces certificats sont auto-signés, uniquement pour le développement"
echo "   Pour la production, utilisez des certificats signés par une CA (Let's Encrypt, etc.)"

