# Dockerfile pour frontend React
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./

# Installer les dépendances (incluant devDependencies pour le build)
RUN npm ci && \
    npm list typescript || npm install typescript

# Copier le code source
COPY . .

# Vérifier que les fichiers nécessaires existent
RUN ls -la && echo "=== Checking files ===" && \
    test -f package.json && echo "✓ package.json" && \
    test -f vite.config.ts && echo "✓ vite.config.ts" && \
    test -f tsconfig.json && echo "✓ tsconfig.json" && \
    test -d src && echo "✓ src directory" || echo "✗ Missing files"

# Build pour production
# Utiliser npx pour s'assurer que les commandes locales sont utilisées
RUN npx tsc --version && \
    npm run build

# Stage de production avec Nginx
FROM nginx:alpine

# Copier les fichiers buildés
COPY --from=builder /app/dist /usr/share/nginx/html

# Créer le répertoire pour les certificats SSL
RUN mkdir -p /etc/nginx/ssl

# Copier les deux configurations Nginx
COPY nginx.conf /etc/nginx/conf.d/default-http.conf
COPY nginx-https.conf /etc/nginx/conf.d/default-https.conf

# Script d'entrée pour choisir HTTP ou HTTPS
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'if [ "$USE_HTTPS" = "true" ] && [ -f /etc/nginx/ssl/cert.pem ] && [ -f /etc/nginx/ssl/key.pem ]; then' >> /docker-entrypoint.sh && \
    echo '  cp /etc/nginx/conf.d/default-https.conf /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '  echo "✓ HTTPS activé"' >> /docker-entrypoint.sh && \
    echo 'else' >> /docker-entrypoint.sh && \
    echo '  cp /etc/nginx/conf.d/default-http.conf /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo '  echo "✓ HTTP activé (HTTPS désactivé ou certificats manquants)"' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80 443

CMD ["/docker-entrypoint.sh"]

