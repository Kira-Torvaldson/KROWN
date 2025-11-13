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

# Copier les fichiers sources
COPY src/ ./src/
COPY Makefile ./

# Compiler
RUN make clean && make

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

