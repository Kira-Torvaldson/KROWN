# Dockerfile pour frontend React
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./

# Mettre à jour npm pour avoir une version récente de npx (sans vulnérabilités)
RUN npm install -g npm@latest

# Installer les dépendances (incluant devDependencies pour le build)
# Corriger automatiquement les vulnérabilités si possible
RUN npm ci && \
    npm audit fix || true

# Copier le code source
COPY . .

# Vérifier que les fichiers nécessaires existent
RUN ls -la && echo "=== Checking files ===" && \
    test -f package.json && echo "✓ package.json" && \
    test -f vite.config.ts && echo "✓ vite.config.ts" && \
    test -f tsconfig.json && echo "✓ tsconfig.json" && \
    test -d src && echo "✓ src directory" || echo "✗ Missing files"

# Build pour production
# Les commandes tsc et vite sont dans node_modules/.bin qui est dans le PATH de npm scripts
RUN npm run build

# Stage de production avec Nginx
FROM nginx:alpine

# Installer openssl pour générer les certificats
RUN apk add --no-cache openssl

# Copier les fichiers buildés
COPY --from=builder /app/dist /usr/share/nginx/html

# Créer le répertoire pour les certificats SSL
RUN mkdir -p /etc/nginx/ssl

# Copier les deux configurations Nginx
COPY nginx.conf /etc/nginx/conf.d/default-http.conf
COPY nginx-https.conf /etc/nginx/conf.d/default-https.conf

# Script d'entrée - Génération automatique des certificats si nécessaire
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo '# Supprimer toutes les configurations existantes' >> /docker-entrypoint.sh && \
    echo 'rm -f /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo '# Générer les certificats SSL si absents et HTTPS activé' >> /docker-entrypoint.sh && \
    echo 'if [ "$USE_HTTPS" != "false" ] && [ "$USE_HTTP_ONLY" != "true" ]; then' >> /docker-entrypoint.sh && \
    echo '  if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then' >> /docker-entrypoint.sh && \
    echo '    echo "🔐 Génération automatique des certificats SSL auto-signés..."' >> /docker-entrypoint.sh && \
    echo '    openssl req -x509 -newkey rsa:4096 \' >> /docker-entrypoint.sh && \
    echo '      -nodes \' >> /docker-entrypoint.sh && \
    echo '      -keyout /etc/nginx/ssl/key.pem \' >> /docker-entrypoint.sh && \
    echo '      -out /etc/nginx/ssl/cert.pem \' >> /docker-entrypoint.sh && \
    echo '      -days 365 \' >> /docker-entrypoint.sh && \
    echo '      -subj "/C=FR/ST=State/L=City/O=Krown/CN=localhost" \' >> /docker-entrypoint.sh && \
    echo '      -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1" 2>/dev/null' >> /docker-entrypoint.sh && \
    echo '    if [ $? -eq 0 ]; then' >> /docker-entrypoint.sh && \
    echo '      chmod 600 /etc/nginx/ssl/key.pem' >> /docker-entrypoint.sh && \
    echo '      chmod 644 /etc/nginx/ssl/cert.pem' >> /docker-entrypoint.sh && \
    echo '      echo "✓ Certificats SSL générés automatiquement"' >> /docker-entrypoint.sh && \
    echo '    else' >> /docker-entrypoint.sh && \
    echo '      echo "⚠️  Erreur lors de la génération des certificats, utilisation de HTTP"' >> /docker-entrypoint.sh && \
    echo '    fi' >> /docker-entrypoint.sh && \
    echo '  fi' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo '# Activer HTTPS si les certificats sont disponibles' >> /docker-entrypoint.sh && \
    echo 'if [ -f /etc/nginx/ssl/cert.pem ] && [ -f /etc/nginx/ssl/key.pem ]; then' >> /docker-entrypoint.sh && \
    echo '  cp /etc/nginx/conf.d/default-https.conf /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '  rm -f /etc/nginx/conf.d/default-http.conf' >> /docker-entrypoint.sh && \
    echo '  echo "✓ HTTPS activé"' >> /docker-entrypoint.sh && \
    echo 'elif [ "$USE_HTTPS" = "false" ] || [ "$USE_HTTP_ONLY" = "true" ]; then' >> /docker-entrypoint.sh && \
    echo '  cp /etc/nginx/conf.d/default-http.conf /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '  rm -f /etc/nginx/conf.d/default-https.conf' >> /docker-entrypoint.sh && \
    echo '  echo "✓ HTTP activé (HTTPS explicitement désactivé)"' >> /docker-entrypoint.sh && \
    echo 'else' >> /docker-entrypoint.sh && \
    echo '  cp /etc/nginx/conf.d/default-http.conf /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '  rm -f /etc/nginx/conf.d/default-https.conf' >> /docker-entrypoint.sh && \
    echo '  echo "⚠️  Certificats SSL non disponibles, utilisation de HTTP"' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80 443

CMD ["/docker-entrypoint.sh"]

