CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11 -D_GNU_SOURCE
LDFLAGS = -lssh -lpthread -lm -ljson-c

# Répertoires
SRC_DIR = src
OBJ_DIR = build
BIN_DIR = bin

# Fichiers sources
SOURCES = $(wildcard $(SRC_DIR)/*.c)
OBJECTS = $(SOURCES:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)
TARGET = $(BIN_DIR)/krown-agent

# Par défaut
all: $(TARGET)

# Compilation
$(TARGET): $(OBJECTS) | $(BIN_DIR)
	@echo "Linking $@..."
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)
	@echo "✓ krown-agent built successfully"

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c | $(OBJ_DIR)
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@

# Créer les répertoires
$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

# Nettoyage
clean:
	rm -rf $(OBJ_DIR) $(BIN_DIR)
	@echo "✓ Cleaned build artifacts"

# Installation
install: $(TARGET)
	cp $(TARGET) /usr/local/bin/
	@echo "✓ krown-agent installed to /usr/local/bin/"

# Dépendances (Ubuntu/Debian)
deps:
	@echo "Installing dependencies..."
	sudo apt-get update
	sudo apt-get install -y libssh-dev build-essential

.PHONY: all clean install deps

