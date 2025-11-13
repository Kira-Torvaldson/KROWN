/**
 * Client pour communiquer avec le daemon C (krown-agent)
 * via socket Unix
 */

import { createConnection } from 'net';
import { existsSync } from 'fs';

const SOCKET_PATH = '/tmp/krown-agent.sock';
const PROTOCOL_VERSION = 1;

/**
 * Classe pour communiquer avec l'agent C
 */
export class AgentClient {
    constructor(socketPath = SOCKET_PATH) {
        this.socketPath = socketPath;
    }

    /**
     * Vérifier si l'agent est disponible
     */
    isAvailable() {
        return existsSync(this.socketPath);
    }

    /**
     * Envoyer une commande à l'agent
     */
    async sendCommand(cmdType, data = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isAvailable()) {
                reject(new Error('Agent non disponible. Assurez-vous que krown-agent est démarré.'));
                return;
            }

            const client = createConnection(this.socketPath);
            
            // Gestion des erreurs de connexion
            client.on('error', (err) => {
                console.error('[AgentClient] Erreur de connexion au socket:', err.message);
                reject(new Error(`Impossible de se connecter à l'agent: ${err.message}`));
            });

            client.on('connect', () => {
                // Préparer la commande
                const jsonData = JSON.stringify(data);
                const dataLen = Buffer.byteLength(jsonData, 'utf8');

                // En-tête: version (4 bytes) + cmd_type (4 bytes) + data_len (4 bytes)
                const header = Buffer.allocUnsafe(12);
                header.writeUInt32LE(PROTOCOL_VERSION, 0);
                header.writeUInt32LE(cmdType, 4);
                header.writeUInt32LE(dataLen, 8);

                // Envoyer
                client.write(header);
                if (dataLen > 0) {
                    client.write(jsonData, 'utf8');
                }
            });

            let responseBuffer = Buffer.alloc(0);
            let headerRead = false;
            let expectedDataLen = 0;

            client.on('data', (data) => {
                responseBuffer = Buffer.concat([responseBuffer, data]);

                if (!headerRead && responseBuffer.length >= 12) {
                    // Lire l'en-tête de réponse
                    const version = responseBuffer.readUInt32LE(0);
                    const code = responseBuffer.readUInt32LE(4);
                    expectedDataLen = responseBuffer.readUInt32LE(8);

                    if (version !== PROTOCOL_VERSION) {
                        client.destroy();
                        reject(new Error(`Version de protocole invalide: ${version}`));
                        return;
                    }

                    headerRead = true;
                    responseBuffer = responseBuffer.slice(12);

                    // Si pas de données, terminer
                    if (expectedDataLen === 0) {
                        client.end();
                        resolve({ code, data: null });
                        return;
                    }
                }

                // Si on a tout reçu
                if (headerRead && responseBuffer.length >= expectedDataLen) {
                    const jsonData = responseBuffer.toString('utf8', 0, expectedDataLen);
                    try {
                        const parsed = JSON.parse(jsonData);
                        client.end();
                        resolve({ code: responseBuffer.readUInt32LE(4), data: parsed });
                    } catch (e) {
                        client.end();
                        reject(new Error(`Erreur parsing JSON: ${e.message}`));
                    }
                }
            });

            client.on('error', (err) => {
                reject(err);
            });

            client.on('close', () => {
                if (!headerRead) {
                    reject(new Error('Connexion fermée avant réception complète'));
                }
            });
        });
    }

    /**
     * Ping l'agent
     */
    async ping() {
        const CMD_PING = 1;
        return this.sendCommand(CMD_PING);
    }

    /**
     * Connecter une session SSH
     */
    async sshConnect(host, port, username, password, privateKey) {
        const CMD_SSH_CONNECT = 2;
        return this.sendCommand(CMD_SSH_CONNECT, {
            host,
            port,
            username,
            password,
            private_key: privateKey
        });
    }

    /**
     * Déconnecter une session SSH
     */
    async sshDisconnect(sessionId) {
        const CMD_SSH_DISCONNECT = 3;
        return this.sendCommand(CMD_SSH_DISCONNECT, { session_id: sessionId });
    }

    /**
     * Exécuter une commande SSH
     */
    async sshExecute(sessionId, command) {
        const CMD_SSH_EXECUTE = 4;
        return this.sendCommand(CMD_SSH_EXECUTE, {
            session_id: sessionId,
            command
        });
    }

    /**
     * Obtenir le statut d'une session SSH
     */
    async sshStatus(sessionId) {
        const CMD_SSH_STATUS = 5;
        return this.sendCommand(CMD_SSH_STATUS, { session_id: sessionId });
    }

    /**
     * Lister toutes les sessions
     */
    async listSessions() {
        const CMD_LIST_SESSIONS = 6;
        return this.sendCommand(CMD_LIST_SESSIONS);
    }
}

