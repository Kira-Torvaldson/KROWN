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

# Exposer le socket (sera monté comme volume)
VOLUME ["/tmp"]

# Utilisateur non-root
USER krown

# Point d'entrée
# Le socket sera passé comme argument ou utilisé par défaut
ENTRYPOINT ["./bin/krown-agent"]
CMD []

