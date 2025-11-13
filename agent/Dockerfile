# Dockerfile pour krown-agent (Daemon C)
FROM debian:bookworm-slim

# Installer les dépendances
RUN apt-get update && apt-get install -y \
    libssh-dev \
    libjson-c-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers sources et le Makefile
COPY src/ ./src/
COPY Makefile ./

# Vérifier que les fichiers nécessaires sont présents
RUN ls -la src/ && \
    test -f Makefile && echo "✓ Makefile présent" && \
    test -f src/main.c && echo "✓ main.c présent" && \
    test -f src/ssh_handler.c && echo "✓ ssh_handler.c présent" || \
    (echo "✗ Fichiers manquants" && exit 1)

# Compiler l'agent
RUN make clean && \
    make && \
    test -f bin/krown-agent && echo "✓ Compilation réussie" || \
    (echo "✗ Échec de la compilation" && exit 1)

# Créer un utilisateur non-root
RUN useradd -r -s /bin/false krown && \
    chown -R krown:krown /app

# Créer le répertoire pour les logs (optionnel)
RUN mkdir -p /var/log/krown && \
    chown krown:krown /var/log/krown

# Exposer le socket (sera monté comme volume)
VOLUME ["/tmp"]

# Utilisateur non-root
USER krown

# Script d'entrée pour initialisation du daemon
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'echo "=== Krown Agent Daemon ==="' >> /docker-entrypoint.sh && \
    echo 'echo "[Agent] Démarrage du daemon SSH..."' >> /docker-entrypoint.sh && \
    echo 'echo "[Agent] Socket: ${SOCKET_PATH:-/tmp/krown-agent.sock}"' >> /docker-entrypoint.sh && \
    echo 'echo "[Agent] Daemon prêt"' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo 'exec ./bin/krown-agent "$@"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Point d'entrée
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []

