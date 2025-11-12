# Système de Logging - Krown

Documentation du système de logging pour Krown.

## Configuration

Le logging est configuré dans `backend/config.toml` :

```toml
[logging]
level = "info"           # Niveau de log: trace, debug, info, warn, error
file_path = "krown.log"  # Chemin du fichier de log (optionnel)
```

### Niveaux de Log

- **trace** : Très détaillé, pour le debugging approfondi
- **debug** : Informations de debug
- **info** : Informations générales (défaut)
- **warn** : Avertissements
- **error** : Erreurs

### Variables d'Environnement

Vous pouvez aussi contrôler le niveau de log via la variable d'environnement :

```bash
RUST_LOG=debug cargo run
RUST_LOG=info cargo run
RUST_LOG=warn cargo run
```

## Format des Logs

### Console

Les logs dans la console sont formatés de manière lisible :
```
2025-01-12T10:00:00.123Z  INFO krown_backend::api: Starting API server on 0.0.0.0:8080
```

### Fichier

Les logs dans les fichiers sont au format JSON pour faciliter le parsing :
```json
{"timestamp":"2025-01-12T10:00:00.123Z","level":"INFO","target":"krown_backend::api","message":"Starting API server on 0.0.0.0:8080","file":"src/api.rs","line":56}
```

## Rotation des Logs

Les logs sont automatiquement rotatés quotidiennement :
- `krown-2025-01-12.log`
- `krown-2025-01-13.log`
- etc.

Les anciens logs sont conservés automatiquement.

## Visualisation dans l'Interface

### Page Logs

Accédez à la page **Logs** dans l'interface web (menu latéral).

**Fonctionnalités :**
- Affichage des dernières N lignes (configurable)
- Auto-refresh toutes les 5 secondes
- Téléchargement des logs
- Coloration par niveau (info, warn, error, debug)
- Filtrage visuel

**Accès :**
- Seuls les **administrateurs** peuvent accéder aux logs
- Endpoint protégé : `GET /api/logs?lines=100&file=krown.log`

## API Endpoint

### GET /api/logs

Récupère les logs du système.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `lines` (optionnel) : Nombre de lignes à récupérer (défaut: 100, max: 1000)
- `file` (optionnel) : Nom du fichier de log (défaut: "krown.log")

**Response:**
```json
{
  "logs": [
    "{\"timestamp\":\"...\",\"level\":\"INFO\",\"message\":\"...\"}",
    "..."
  ],
  "total_lines": 1250,
  "returned_lines": 100
}
```

**Permissions:**
- Seuls les utilisateurs avec le rôle `admin` peuvent accéder aux logs

## Exemples d'Utilisation

### Backend

```rust
use tracing::{info, warn, error, debug};

info!("User logged in: {}", username);
warn!("Connection timeout for session: {}", session_id);
error!("Failed to execute command: {}", error);
debug!("SSH connection established to {}", host);
```

### Frontend

```typescript
// Charger les logs
const logs = await apiService.getLogs(200)

// Avec auto-refresh
useEffect(() => {
  const interval = setInterval(() => {
    loadLogs()
  }, 5000)
  return () => clearInterval(interval)
}, [])
```

## Localisation des Fichiers

Par défaut, les logs sont écrits dans :
- **Développement** : `backend/krown.log`
- **Production** : Configurable via `logging.file_path` dans `config.toml`

## Bonnes Pratiques

1. **Niveau de log en production** : Utiliser `info` ou `warn`
2. **Niveau de log en développement** : Utiliser `debug` pour plus de détails
3. **Rotation** : Les logs sont automatiquement rotatés, pas besoin de nettoyage manuel
4. **Sécurité** : Les logs peuvent contenir des informations sensibles, limiter l'accès
5. **Performance** : Le logging asynchrone (non-blocking) n'impacte pas les performances

## Dépannage

### Les logs ne s'écrivent pas dans le fichier

- Vérifier que `file_path` est configuré dans `config.toml`
- Vérifier les permissions d'écriture sur le répertoire
- Vérifier que le répertoire existe

### Les logs sont trop verbeux

- Réduire le niveau : `level = "warn"` ou `level = "error"`
- Utiliser `RUST_LOG=warn` pour override temporaire

### Les logs sont trop volumineux

- Les logs sont rotatés quotidiennement
- Supprimer manuellement les anciens fichiers si nécessaire
- Configurer une politique de rétention

