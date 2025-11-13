# Dockerfile pour krown-api (Backend Node.js)
FROM node:20-alpine

# Installer les dépendances système si nécessaire
# (pour communiquer avec le socket Unix de l'agent et générer les certificats)
RUN apk add --no-cache \
    bash \
    openssl

# Créer le répertoire de travail
WORKDIR /app

# Mettre à jour npm pour avoir une version récente (sans vulnérabilités)
RUN npm install -g npm@latest

# Copier les fichiers de dépendances
COPY package.json ./

# Installer les dépendances (production + dev pour le développement)
# Corriger automatiquement les vulnérabilités si possible
RUN npm install && \
    npm audit fix || true

# Copier le code source
COPY server.js ./
COPY agent-client.js ./
COPY https-server.js ./

# Créer le répertoire pour les certificats SSL
RUN mkdir -p /app/certs

# Créer un utilisateur non-root (sans spécifier de GID/UID pour éviter les conflits)
RUN addgroup -S nodeuser && \
    adduser -S -G nodeuser nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

# Exposer les ports
EXPOSE 8080 8443

# Script d'entrée pour générer les certificats si nécessaire
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo '# Générer les certificats SSL si absents et HTTPS activé' >> /docker-entrypoint.sh && \
    echo 'if [ "$USE_HTTPS" != "false" ] && [ "$USE_HTTPS" != "0" ]; then' >> /docker-entrypoint.sh && \
    echo '  if [ ! -f /app/certs/cert.pem ] || [ ! -f /app/certs/key.pem ]; then' >> /docker-entrypoint.sh && \
    echo '    echo "🔐 Génération automatique des certificats SSL auto-signés..."' >> /docker-entrypoint.sh && \
    echo '    openssl req -x509 -newkey rsa:4096 \' >> /docker-entrypoint.sh && \
    echo '      -nodes \' >> /docker-entrypoint.sh && \
    echo '      -keyout /app/certs/key.pem \' >> /docker-entrypoint.sh && \
    echo '      -out /app/certs/cert.pem \' >> /docker-entrypoint.sh && \
    echo '      -days 365 \' >> /docker-entrypoint.sh && \
    echo '      -subj "/C=FR/ST=State/L=City/O=Krown/CN=localhost" \' >> /docker-entrypoint.sh && \
    echo '      -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1" 2>/dev/null' >> /docker-entrypoint.sh && \
    echo '    if [ $? -eq 0 ]; then' >> /docker-entrypoint.sh && \
    echo '      chmod 600 /app/certs/key.pem' >> /docker-entrypoint.sh && \
    echo '      chmod 644 /app/certs/cert.pem' >> /docker-entrypoint.sh && \
    echo '      echo "✓ Certificats SSL générés automatiquement dans /app/certs/"' >> /docker-entrypoint.sh && \
    echo '    else' >> /docker-entrypoint.sh && \
    echo '      echo "⚠️  Erreur lors de la génération des certificats"' >> /docker-entrypoint.sh && \
    echo '    fi' >> /docker-entrypoint.sh && \
    echo '  else' >> /docker-entrypoint.sh && \
    echo '    echo "✓ Certificats SSL trouvés dans /app/certs/"' >> /docker-entrypoint.sh && \
    echo '  fi' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo 'exec node server.js' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Point d'entrée
CMD ["/docker-entrypoint.sh"]

