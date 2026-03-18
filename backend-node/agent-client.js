/**
 * Client pour communiquer avec le daemon C (krown-agent)
 * via socket Unix
 */

import { createConnection } from 'net';
import { existsSync } from 'fs';

const SOCKET_PATH = '/tmp/krown-agent.sock';
const PROTOCOL_VERSION = 1;
const MAX_PAYLOAD_LEN = 1024 * 1024; // 1 MiB, doit rester cohérent avec l'agent

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
    async sendCommand(cmdType, data = {}, options = {}) {
        const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
        return new Promise((resolve, reject) => {
            if (!this.isAvailable()) {
                reject(new Error(
                    `Agent non disponible. L'agent C (krown-agent) doit être démarré localement sur cette machine (socket: ${this.socketPath}).`
                ));
                return;
            }

            const client = createConnection(this.socketPath);
            
            let settled = false;
            let timeout;
            const settleOnce = (err, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                client.removeAllListeners();
                try { client.end(); } catch {}
                if (err) reject(err);
                else resolve(value);
            };

            client.on('connect', () => {
                // Préparer la commande
                const jsonData = JSON.stringify(data);
                const dataLen = Buffer.byteLength(jsonData, 'utf8');
                if (dataLen > MAX_PAYLOAD_LEN) {
                    client.destroy();
                    settleOnce(new Error(`Payload trop grand: ${dataLen} (max=${MAX_PAYLOAD_LEN})`));
                    return;
                }

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
            let responseCode = null;
            
            timeout = setTimeout(() => {
                client.destroy();
                settleOnce(new Error(`Timeout: l'agent n'a pas répondu dans les ${timeoutMs} ms`));
            }, timeoutMs);

            client.on('data', (data) => {
                responseBuffer = Buffer.concat([responseBuffer, data]);

                if (!headerRead && responseBuffer.length >= 12) {
                    // Lire l'en-tête de réponse
                    const version = responseBuffer.readUInt32LE(0);
                    const code = responseBuffer.readUInt32LE(4);
                    expectedDataLen = responseBuffer.readUInt32LE(8);

                    if (version !== PROTOCOL_VERSION) {
                        client.destroy();
                        settleOnce(new Error(`Version de protocole invalide: ${version}`));
                        return;
                    }

                    if (expectedDataLen > MAX_PAYLOAD_LEN) {
                        client.destroy();
                        settleOnce(new Error(`Payload trop grand: ${expectedDataLen} (max=${MAX_PAYLOAD_LEN})`));
                        return;
                    }

                    headerRead = true;
                    responseCode = code;
                    responseBuffer = responseBuffer.slice(12);

                    // Si pas de données, terminer
                    if (expectedDataLen === 0) {
                        settleOnce(null, { code, data: null });
                        return;
                    }
                }

                // Si on a tout reçu
                if (headerRead && responseBuffer.length >= expectedDataLen) {
                    const jsonData = responseBuffer.toString('utf8', 0, expectedDataLen);
                    try {
                        const parsed = JSON.parse(jsonData);
                        settleOnce(null, { code: responseCode ?? 1, data: parsed });
                    } catch (e) {
                        settleOnce(new Error(`Erreur parsing JSON: ${e.message}`));
                    }
                }
            });

            client.on('error', (err) => {
                console.error('[AgentClient] Erreur socket:', err.message);
                settleOnce(new Error(`Erreur de communication avec l'agent: ${err.message}`));
            });

            client.on('close', () => {
                if (settled) return;
                if (!headerRead) {
                    settleOnce(new Error('Connexion fermée avant réception de l\'en-tête de réponse'));
                    return;
                }
                if (responseBuffer.length < expectedDataLen) {
                    settleOnce(new Error('Connexion fermée avant réception complète du payload'));
                    return;
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
    async sshConnect(host, port, username, password, privateKey, passphrase) {
        const CMD_SSH_CONNECT = 2;
        const data = {
            host,
            port,
            username
        };
        
        if (password) {
            data.password = password;
        }
        if (privateKey) {
            data.private_key = privateKey;
        }
        if (passphrase) {
            data.passphrase = passphrase;
        }
        
        return this.sendCommand(CMD_SSH_CONNECT, data);
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
    async sshExecute(sessionId, command, requestPty = false) {
        const CMD_SSH_EXECUTE = 4;
        return this.sendCommand(CMD_SSH_EXECUTE, {
            session_id: sessionId,
            command,
            request_pty: !!requestPty
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

    async sshShellStart(sessionId, cols, rows) {
        return this.sendCommand(7, { session_id: sessionId, cols, rows });
    }

    async sshShellWrite(sessionId, data) {
        return this.sendCommand(8, { session_id: sessionId, data });
    }

    async sshShellRead(sessionId, maxBytes, timeoutMs) {
        return this.sendCommand(
            9,
            { session_id: sessionId, max_bytes: maxBytes, timeout_ms: timeoutMs },
            { timeoutMs: Math.min(65000, Math.max(5000, (timeoutMs || 200) + 8000)) },
        );
    }

    async sshShellResize(sessionId, cols, rows) {
        return this.sendCommand(10, { session_id: sessionId, cols, rows });
    }

    async sshShellClose(sessionId) {
        return this.sendCommand(11, { session_id: sessionId });
    }
}

