# Guide de Compilation - krown-agent

## Erreurs de compilation courantes

### Erreur : "json-c/json.h: No such file or directory"

**Solution :**

```bash
sudo apt-get install libjson-c-dev
```

### Erreur : "libssh/libssh.h: No such file or directory"

**Solution :**

```bash
sudo apt-get install libssh-dev
```

### Erreur : "undefined reference to `json_object_*`"

**Solution :**

Vérifiez que `-ljson-c` est dans les LDFLAGS du Makefile.

### Erreur : "undefined reference to `ssh_*`"

**Solution :**

Vérifiez que `-lssh` est dans les LDFLAGS du Makefile.

## Compilation pas à pas

### 1. Installer toutes les dépendances

```bash
cd agent
make deps
```

Ou manuellement :

```bash
sudo apt-get update
sudo apt-get install -y \
    libssh-dev \
    libjson-c-dev \
    build-essential
```

### 2. Nettoyer les anciens builds

```bash
make clean
```

### 3. Compiler

```bash
make
```

### 4. Vérifier la compilation

```bash
ls -l bin/krown-agent
file bin/krown-agent
ldd bin/krown-agent
```

### 5. Tester

```bash
./bin/krown-agent
```

Vous devriez voir :
```
=== Krown Agent v1.0 ===
[Agent] Démarrage du daemon SSH...
[Agent] Gestionnaire SSH initialisé
[Socket] Serveur démarré sur /tmp/krown-agent.sock
[Agent] Daemon prêt, en attente de commandes...
```

### 6. Installer (optionnel)

```bash
sudo make install
```

## Vérification des dépendances

```bash
# Vérifier que les bibliothèques sont installées
pkg-config --exists libssh && echo "libssh OK" || echo "libssh MANQUANT"
pkg-config --exists json-c && echo "json-c OK" || echo "json-c MANQUANT"

# Vérifier les chemins d'inclusion
gcc -E -x c - -v < /dev/null 2>&1 | grep -A 20 "#include"
```

## Dépannage avancé

### Compiler avec plus de détails

```bash
make clean
make CFLAGS="-Wall -Wextra -O2 -std=c11 -D_GNU_SOURCE -g -v"
```

### Vérifier les symboles manquants

```bash
# Après compilation
nm bin/krown-agent | grep -i " U " | grep -E "(json|ssh)"
```

### Compiler fichier par fichier

```bash
cd agent
gcc -Wall -Wextra -O2 -std=c11 -D_GNU_SOURCE -c src/ssh_handler.c -o build/ssh_handler.o -lssh -ljson-c
```

Si cela échoue, l'erreur complète sera affichée.

