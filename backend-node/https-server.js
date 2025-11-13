/**
 * Configuration HTTPS pour krown-api
 * 
 * Pour générer un certificat auto-signé pour le développement :
 * openssl req -x509 -newkey rsa:4096 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost"
 */

import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Charger les certificats SSL
 */
export function createHttpsServer(app) {
    const certPath = process.env.SSL_CERT_PATH || join(__dirname, 'certs/cert.pem');
    const keyPath = process.env.SSL_KEY_PATH || join(__dirname, 'certs/key.pem');

    // Vérifier si les certificats existent
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.warn('[HTTPS] Certificats SSL non trouvés, HTTPS désactivé');
        console.warn(`[HTTPS] Certificats attendus: ${certPath} et ${keyPath}`);
        console.warn('[HTTPS] Pour générer des certificats auto-signés:');
        console.warn('  mkdir -p certs');
        console.warn('  openssl req -x509 -newkey rsa:4096 -nodes -keyout certs/key.pem -out certs/cert.pem -days 365 -subj "/CN=localhost"');
        return null;
    }

    try {
        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };

        return https.createServer(options, app);
    } catch (error) {
        console.error('[HTTPS] Erreur lors du chargement des certificats:', error.message);
        return null;
    }
}

