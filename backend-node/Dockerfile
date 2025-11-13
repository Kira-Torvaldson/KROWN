# Dockerfile pour krown-api (Backend Node.js)
FROM node:20-alpine

# Installer les dépendances système si nécessaire
# (pour communiquer avec le socket Unix de l'agent)
RUN apk add --no-cache \
    bash

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

# Créer un utilisateur non-root (sans spécifier de GID/UID pour éviter les conflits)
RUN addgroup -S nodeuser && \
    adduser -S -G nodeuser nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

# Exposer le port
EXPOSE 8080

# Point d'entrée
CMD ["node", "server.js"]

