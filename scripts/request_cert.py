#!/usr/bin/env python3
"""
Script Python pour demander un certificat SSH au service de signature
Alternative plus robuste au script bash
"""
import sys
import json
import os
import subprocess
from pathlib import Path
from typing import Optional

import requests


def main():
    signing_service_url = os.environ.get("SIGNING_SERVICE_URL", "http://localhost:8080")
    
    # Arguments
    key_file = sys.argv[1] if len(sys.argv) > 1 else str(Path.home() / ".ssh" / "id_ed25519")
    username = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("USER", "user")
    principals = sys.argv[3] if len(sys.argv) > 3 else username
    ttl_seconds = int(sys.argv[4]) if len(sys.argv) > 4 else 600
    
    # Vérifier que la clé existe
    key_path = Path(key_file)
    pubkey_path = key_path.with_suffix(key_path.suffix + ".pub")
    
    if not pubkey_path.exists():
        print(f"Error: Public key not found: {pubkey_path}", file=sys.stderr)
        print(f"Usage: {sys.argv[0]} [key_file] [username] [principals] [ttl_seconds]", file=sys.stderr)
        sys.exit(1)
    
    # Lire la clé publique
    with open(pubkey_path, "r") as f:
        pubkey = f.read().strip()
    
    # Préparer la requête
    payload = {
        "pubkey": pubkey,
        "username": username,
        "principals": [principals],
        "ttl_seconds": ttl_seconds
    }
    
    # Envoyer la requête
    print(f"Requesting certificate from {signing_service_url}/sign...")
    try:
        response = requests.post(
            f"{signing_service_url}/sign",
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: Failed to connect to signing service: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON response: {e}", file=sys.stderr)
        print(f"Response: {response.text}", file=sys.stderr)
        sys.exit(1)
    
    # Extraire le certificat
    cert = data.get("cert")
    expires_at = data.get("expires_at")
    
    if not cert:
        error_msg = data.get("detail", data.get("error", "Unknown error"))
        print(f"Error: Failed to get certificate: {error_msg}", file=sys.stderr)
        sys.exit(1)
    
    # Écrire le certificat
    cert_file = key_path.with_suffix(key_path.suffix + "-cert.pub")
    with open(cert_file, "w") as f:
        f.write(cert)
    
    # Permissions
    os.chmod(cert_file, 0o644)
    
    print(f"Certificate saved to: {cert_file}")
    print(f"Expires at: {expires_at}")
    print("")
    print("You can now use this certificate with SSH:")
    print(f"  ssh -i {key_file} -J bastion.example.com user@target.example.com")


if __name__ == "__main__":
    main()

