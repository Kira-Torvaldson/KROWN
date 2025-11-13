# Dockerfile pour frontend React
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./

# Installer les dépendances
RUN npm ci

# Copier le code source
COPY . .

# Build pour production (avec gestion d'erreur)
RUN npm run build

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

