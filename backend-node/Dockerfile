# Dockerfile pour krown-api (Backend Node.js)
FROM node:20-alpine

# Installer les dépendances système si nécessaire
# (pour communiquer avec le socket Unix de l'agent)
RUN apk add --no-cache \
    bash

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json ./

# Installer les dépendances
RUN npm install --production

# Copier le code source
COPY server.js ./
COPY agent-client.js ./

# Créer un utilisateur non-root
RUN addgroup -g 1000 nodeuser && \
    adduser -D -u 1000 -G nodeuser nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

# Exposer le port
EXPOSE 8080

# Point d'entrée
CMD ["node", "server.js"]

