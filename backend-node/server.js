/**
 * Krown API Server - Serveur Node.js pour orchestration
 * 
 * Ce serveur expose une API REST et WebSocket pour gérer les sessions SSH
 * via le daemon C (krown-agent).
 */

import express from 'express';
import { createServer } from 'http';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import { AgentClient } from './agent-client.js';
import { spawn, exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { createHttpsServer } from './https-server.js';
import {
    mapAgentResultToHttp,
    mapAgentTransportError,
} from './session-error-mapper.js';
import { WebSocketServer } from 'ws';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Créer le serveur HTTP ou HTTPS selon la configuration
const USE_HTTPS = process.env.USE_HTTPS === 'true' || process.env.USE_HTTPS === '1';
let httpServer;

if (USE_HTTPS) {
    const httpsServer = createHttpsServer(app);
    if (httpsServer) {
        httpServer = httpsServer;
        console.log('[Server] Mode HTTPS activé');
    } else {
        httpServer = createServer(app);
        console.warn('[Server] HTTPS demandé mais certificats introuvables, utilisation de HTTP');
    }
} else {
    httpServer = createServer(app);
    console.log('[Server] Mode HTTP (HTTPS désactivé)');
}

const terminalWss = new WebSocketServer({ noServer: true });

/**
 * WebSocket PTY: /api/ssh/:sessionId/stream — shell distant persistant (agent CMD 7–11).
 */
function attachTerminalStreamUpgrade(server) {
    server.on('upgrade', (request, socket, head) => {
        let pathname;
        try {
            const host = request.headers.host || '127.0.0.1';
            pathname = new URL(request.url || '', `http://${host}`).pathname;
        } catch {
            return;
        }
        const m = pathname.match(/^\/api\/ssh\/([^/]+)\/stream$/);
        if (!m) return;
        terminalWss.handleUpgrade(request, socket, head, (ws) => {
            void runTerminalPtySession(ws, m[1]);
        });
    });
}

async function runTerminalPtySession(ws, sessionId) {
    let shellReady = false;
    let closed = false;
    let initTimer;

    const cleanup = async () => {
        closed = true;
        clearTimeout(initTimer);
        try {
            await agentClient.sshShellClose(sessionId);
        } catch {
            /* ignore */
        }
    };

    const pump = async () => {
        while (!closed && ws.readyState === 1) {
            try {
                const r = await agentClient.sshShellRead(sessionId, 32768, 280);
                if (r.code !== 0) break;
                const b64 = r.data?.data;
                if (b64 && typeof b64 === 'string' && b64.length > 0) {
                    ws.send(JSON.stringify({ event: 'pty', data: b64 }));
                }
                if (r.data?.eof) {
                    ws.send(JSON.stringify({ event: 'pty_eof' }));
                    break;
                }
            } catch {
                break;
            }
        }
        if (ws.readyState === 1) {
            try {
                ws.close();
            } catch {
                /* ignore */
            }
        }
    };

    const startShell = async (cols, rows) => {
        if (shellReady || closed) return;
        try {
            if (!agentClient.isAvailable()) {
                ws.send(JSON.stringify({
                    event: 'error',
                    message: 'Agent SSH non disponible',
                    stage: 'agent_unavailable',
                }));
                ws.close();
                return;
            }
            const r = await agentClient.sshShellStart(sessionId, cols, rows);
            if (r.code !== 0) {
                const mapped = mapAgentResultToHttp(r, { stage: 'ssh_shell_start' });
                const b = mapped.body;
                ws.send(JSON.stringify({
                    event: 'error',
                    message: b.error,
                    stage: b.stage,
                    ...(b.code !== undefined && { code: b.code }),
                }));
                ws.close();
                return;
            }
            shellReady = true;
            clearTimeout(initTimer);
            ws.send(JSON.stringify({ event: 'shell_ready', shell: r.data?.shell || '' }));
            void pump();
        } catch (e) {
            ws.send(JSON.stringify({ event: 'error', message: e?.message || 'Erreur shell' }));
            ws.close();
        }
    };

    ws.on('message', (raw) => {
        void (async () => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'init') {
                    const cols = Math.min(500, Math.max(20, Number(msg.cols) || 80));
                    const rows = Math.min(200, Math.max(5, Number(msg.rows) || 24));
                    await startShell(cols, rows);
                } else if (msg.type === 'input' && shellReady && typeof msg.data === 'string') {
                    await agentClient.sshShellWrite(sessionId, msg.data);
                } else if (msg.type === 'resize' && shellReady) {
                    const cols = Math.min(500, Math.max(20, Number(msg.cols) || 80));
                    const rows = Math.min(200, Math.max(5, Number(msg.rows) || 24));
                    await agentClient.sshShellResize(sessionId, cols, rows);
                }
            } catch (e) {
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ event: 'error', message: e?.message || 'Erreur' }));
                }
            }
        })();
    });

    ws.on('close', () => {
        void cleanup();
    });

    initTimer = setTimeout(() => {
        if (!shellReady && ws.readyState === 1) {
            ws.send(JSON.stringify({
                event: 'error',
                message: 'Message init (cols/rows) requis dans les 8 s',
                stage: 'terminal_init_timeout',
            }));
            ws.close();
        }
    }, 8000);
}

attachTerminalStreamUpgrade(httpServer);

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const AGENT_SOCKET = process.env.AGENT_SOCKET || '/tmp/krown-agent.sock';
const AGENT_BINARY = process.env.AGENT_BINARY || join(__dirname, '../agent/bin/krown-agent');

// Middleware
app.use(cors());
app.use(express.json());

// Client agent
const agentClient = new AgentClient(AGENT_SOCKET);

// Démarrer l'agent si nécessaire
async function ensureAgentRunning() {
    if (!agentClient.isAvailable()) {
        console.log('[API] Agent non détecté, tentative de démarrage...');
        
        // En Docker, l'agent est un service séparé, ne pas essayer de le démarrer
        if (process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true') {
            console.log('[API] Mode Docker détecté, l\'agent doit être démarré séparément');
            console.log('[API] Attente de l\'agent...');
            
            // Attendre que l'agent soit disponible (max 30 secondes)
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (agentClient.isAvailable()) {
                    console.log('[API] Agent détecté et disponible');
                    return;
                }
            }
            console.warn('[API] Agent non disponible après 30 secondes');
        } else if (existsSync(AGENT_BINARY)) {
            const agent = spawn(AGENT_BINARY, [AGENT_SOCKET], {
                detached: true,
                stdio: 'ignore'
            });
            // Ne jamais faire crasher l'API si le spawn échoue (env Windows, binaire absent, permissions, etc.)
            agent.on('error', (err) => {
                console.warn('[API] Impossible de démarrer automatiquement l\'agent:', err.message);
            });
            agent.unref();
            
            // Attendre un peu que l'agent démarre
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (agentClient.isAvailable()) {
                console.log('[API] Agent démarré avec succès');
            } else {
                console.warn('[API] Agent démarré mais socket non disponible');
            }
        } else {
            console.warn(`[API] Binaire agent introuvable: ${AGENT_BINARY}`);
            console.warn('[API] Compilez l\'agent avec: cd agent && make');
        }
    } else {
        console.log('[API] Agent détecté et disponible');
    }
}

// Routes API

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const ping = await agentClient.ping();
        res.json({
            status: 'ok',
            agent: ping.data || { status: 'unknown' },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            error: error.message
        });
    }
});

// Ping
app.get('/api/ping', async (req, res) => {
    try {
        const result = await agentClient.ping();
        res.json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sessions SSH
app.post('/api/sessions', async (req, res) => {
    try {
        const { host, port = 22, username, password, private_key, passphrase } = req.body || {};

        if (process.env.KROWN_DEBUG === '1') {
            console.log('[API] SSH connect attempt:', {
                host,
                port,
                username,
                hasKey: !!private_key,
                hasPassword: !!(password && String(password).length > 0),
            });
        }

        if (!host || typeof host !== 'string' || !host.trim() || !username || typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({
                error: 'host et username requis (non vides)',
                stage: 'payload_validation',
            });
        }

        const p = Number(port);
        if (!Number.isFinite(p) || p < 1 || p > 65535) {
            return res.status(400).json({
                error: 'port invalide (1–65535)',
                stage: 'payload_validation',
            });
        }

        // Politique: authentification par clé uniquement (pas de mot de passe)
        if (!agentClient.isAvailable()) {
            console.warn('[API] Agent indisponible, socket:', AGENT_SOCKET);
            await ensureAgentRunning();
            await new Promise((resolve) => setTimeout(resolve, 2000));

            if (!agentClient.isAvailable()) {
                return res.status(503).json({
                    error: 'Agent SSH non disponible. Vérifiez que krown-agent est démarré.',
                    stage: 'agent_unavailable',
                    details: {
                        socket_path: AGENT_SOCKET,
                        hint: 'En Docker, vérifiez que le service agent est démarré: docker compose ps agent',
                    },
                });
            }
        }

        const pwd =
            password && String(password).length > 0 ? String(password) : null;
        const result = await agentClient.sshConnect(
            host.trim(),
            p,
            username.trim(),
            pwd,
            private_key,
            passphrase,
        );

        if (result.code === 0) {
            const agentData = result.data || {};
            const session = {
                id: agentData.session_id || `session_${Date.now()}`,
                user_id: 'system',
                host: agentData.host || host,
                port: agentData.port || p,
                username: username.trim(),
                status: agentData.status || 'connected',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            if (process.env.KROWN_DEBUG === '1') {
                console.log('[API] Session créée:', session.id);
            }
            io.emit('session:connected', session);
            return res.json(session);
        }

        const { httpStatus, body } = mapAgentResultToHttp(result, { stage: 'ssh_connect' });
        console.warn('[API] Échec SSH agent:', { code: result.code, stage: body.stage });
        return res.status(httpStatus).json(body);
    } catch (error) {
        console.error('[API] Erreur création session:', error?.message || error);
        const { httpStatus, body } = mapAgentTransportError(error, 'ssh_connect');
        return res.status(httpStatus).json(body);
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const result = await agentClient.listSessions();
        if (result.code !== 0) {
            const { httpStatus, body } = mapAgentResultToHttp(result, { stage: 'list_sessions' });
            return res.status(httpStatus).json(body);
        }
        const agentData = result.data || { sessions: [] };
        const sessions = (agentData.sessions || []).map((s) => ({
            id: s.id || s.session_id,
            user_id: 'system',
            host: s.host || 'unknown',
            port: s.port || 22,
            username: s.username || 'unknown',
            status: s.status || 'connected',
            created_at: s.created_at ? new Date(s.created_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));
        res.json(sessions);
    } catch (error) {
        const { httpStatus, body } = mapAgentTransportError(error, 'list_sessions');
        res.status(httpStatus).json(body);
    }
});

app.get('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agentClient.sshStatus(id);
        const agentData = result.data || {};

        if (result.code !== 0) {
            const { httpStatus, body } = mapAgentResultToHttp(result, { stage: 'session_status' });
            return res.status(httpStatus).json(body);
        }

        if (agentData.status === 'not_found') {
            return res.status(404).json({
                error: 'Session non trouvée',
                stage: 'session_not_found',
            });
        }

        const session = {
            id,
            user_id: 'system',
            host: agentData.host || 'unknown',
            port: agentData.port || 22,
            username: agentData.username || 'unknown',
            status: agentData.status || 'connected',
            created_at: agentData.created_at ? new Date(agentData.created_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        res.json(session);
    } catch (error) {
        const { httpStatus, body } = mapAgentTransportError(error, 'session_status');
        res.status(httpStatus).json(body);
    }
});

app.delete('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agentClient.sshDisconnect(id);

        if (result.code === 0) {
            io.emit('session:disconnected', { session_id: id });
            return res.json({ status: 'disconnected' });
        }
        const { httpStatus, body } = mapAgentResultToHttp(result, { stage: 'ssh_disconnect' });
        return res.status(httpStatus).json(body);
    } catch (error) {
        const { httpStatus, body } = mapAgentTransportError(error, 'ssh_disconnect');
        res.status(httpStatus).json(body);
    }
});

// Exécution de commandes
app.post('/api/sessions/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const { command, request_pty } = req.body;
        
        if (!command || typeof command !== 'string') {
            return res.status(400).json({ error: 'command requis (chaîne non vide)', stage: 'payload_validation' });
        }

        if (!agentClient.isAvailable()) {
            return res.status(503).json({
                error: 'Agent SSH non disponible. Vérifiez que krown-agent est démarré.',
                stage: 'agent_unavailable',
                details: {
                    socket_path: AGENT_SOCKET,
                    remote_agent_install_required: false,
                    note: 'krown-agent est un daemon local (ou conteneur) et ne s’installe pas sur la machine SSH distante.',
                },
            });
        }

        const result = await agentClient.sshExecute(id, command, !!request_pty);

        if (result.code === 0) {
            io.emit('session:output', {
                session_id: id,
                output: result.data.output,
                stderr: result.data.stderr,
                exit_code: result.data.exit_code,
                pty_used: result.data.pty_used,
            });
            return res.json(result.data);
        }
        const { httpStatus, body } = mapAgentResultToHttp(result, { stage: 'ssh_execute' });
        return res.status(httpStatus).json(body);
    } catch (error) {
        const { httpStatus, body } = mapAgentTransportError(error, 'ssh_execute');
        if (httpStatus === 503) {
            body.details = {
                ...(body.details && typeof body.details === 'object' ? body.details : {}),
                socket_path: AGENT_SOCKET,
                remote_agent_install_required: false,
                note: 'krown-agent est un daemon local (ou conteneur) et ne s’installe pas sur la machine SSH distante.',
            };
        }
        res.status(httpStatus).json(body);
    }
});

// Logs de l'agent
app.get('/api/logs/agent', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        
        // En Docker, récupérer les logs du conteneur
        if (process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production') {
            try {
                const { stdout, stderr } = await execAsync(`docker logs --tail ${lines} krown-agent 2>&1 || echo "Conteneur non trouvé"`);
                const logs = (stdout || stderr || '').trim();
                if (logs && !logs.includes('Conteneur non trouvé')) {
                    return res.json({
                        source: 'docker',
                        container: 'krown-agent',
                        lines: lines,
                        logs: logs.split('\n').filter(line => line.trim().length > 0)
                    });
                } else {
                    return res.status(404).json({ 
                        error: 'Conteneur krown-agent non trouvé',
                        hint: 'Vérifiez que le conteneur est en cours d\'exécution: docker compose ps agent'
                    });
                }
            } catch (error) {
                console.error('[API] Erreur récupération logs Docker:', error.message);
                return res.status(500).json({ 
                    error: 'Impossible de récupérer les logs Docker',
                    details: error.message,
                    hint: 'Vérifiez que docker est accessible et que le conteneur krown-agent est en cours d\'exécution'
                });
            }
        } else {
            // En mode manuel, essayer de lire un fichier de log
            const logFile = join(__dirname, '../agent/krown-agent.log');
            if (existsSync(logFile)) {
                const content = readFileSync(logFile, 'utf8');
                const logLines = content.split('\n').filter(line => line.trim().length > 0);
                const recentLogs = logLines.slice(-lines);
                return res.json({
                    source: 'file',
                    file: logFile,
                    lines: lines,
                    logs: recentLogs
                });
            } else {
                return res.status(404).json({ 
                    error: 'Fichier de log introuvable',
                    hint: 'Les logs de l\'agent ne sont pas disponibles en mode manuel sans fichier de log. Lancez l\'agent avec redirection: ./bin/krown-agent > krown-agent.log 2>&1'
                });
            }
        }
    } catch (error) {
        console.error('[API] Erreur récupération logs agent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Logs du backend
app.get('/api/logs/backend', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        
        // En Docker, récupérer les logs du conteneur
        if (process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production') {
            try {
                const { stdout, stderr } = await execAsync(`docker logs --tail ${lines} krown-api 2>&1 || echo ""`);
                const logs = (stdout || stderr || '').trim();
                return res.json({
                    source: 'docker',
                    container: 'krown-api',
                    lines: lines,
                    logs: logs.split('\n').filter(line => line.trim().length > 0)
                });
            } catch (error) {
                console.error('[API] Erreur récupération logs Docker:', error.message);
                return res.status(500).json({ 
                    error: 'Impossible de récupérer les logs Docker'
                });
            }
        } else {
            // En mode manuel, retourner un message
            return res.json({
                source: 'console',
                lines: lines,
                logs: ['Les logs du backend sont disponibles dans la console'],
                hint: 'En mode développement, les logs sont affichés dans la console'
            });
        }
    } catch (error) {
        console.error('[API] Erreur récupération logs backend:', error);
        res.status(500).json({ error: error.message });
    }
});

// Tous les logs (agent + backend)
app.get('/api/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        
        // Récupérer les logs directement
        let agentData = { logs: [], error: null };
        let backendData = { logs: [], error: null };
        
        // Logs agent
        try {
            if (process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production') {
                const { stdout } = await execAsync(`docker logs --tail ${lines} krown-agent 2>&1 || echo ""`);
                agentData.logs = (stdout || '').split('\n').filter(line => line.trim().length > 0);
                agentData.source = 'docker';
            }
        } catch (error) {
            agentData.error = error.message;
        }
        
        // Logs backend
        try {
            if (process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production') {
                const { stdout } = await execAsync(`docker logs --tail ${lines} krown-api 2>&1 || echo ""`);
                backendData.logs = (stdout || '').split('\n').filter(line => line.trim().length > 0);
                backendData.source = 'docker';
            } else {
                backendData.logs = ['Les logs du backend sont disponibles dans la console'];
                backendData.source = 'console';
            }
        } catch (error) {
            backendData.error = error.message;
        }
        
        return res.json({
            agent: agentData,
            backend: backendData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Erreur récupération logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// WebSocket
io.on('connection', (socket) => {
    socket.emit('welcome', {
        message: 'Connecté à Krown API',
        agent_available: agentClient.isAvailable()
    });

    socket.on('subscribe:session', (sessionId) => {
        socket.join(`session:${sessionId}`);
    });
});

// Démarrer le serveur
export async function startServer({ port } = {}) {
    await ensureAgentRunning();
    
    const isHttps = USE_HTTPS && httpServer instanceof https.Server;
    const protocol = isHttps ? 'https' : 'http';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const listenPort = port !== undefined ? port : (isHttps ? HTTPS_PORT : PORT);
    
    return await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(listenPort, () => {
            const addr = httpServer.address();
            const actualPort = typeof addr === 'object' && addr ? addr.port : listenPort;
            console.log('=== Krown API Server ===');
            console.log(`[API] Serveur démarré sur ${protocol}://localhost:${actualPort}`);
            console.log(`[API] Agent socket: ${AGENT_SOCKET}`);
            console.log(`[API] WebSocket disponible sur ${wsProtocol}://localhost:${actualPort}`);
            resolve({ port: actualPort, server: httpServer });
        });
    });
}

export async function stopServer() {
    if (!httpServer.listening) return;
    await new Promise((resolve) => httpServer.close(resolve));
}

// Si exécuté en CLI, démarrer normalement
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    startServer().catch(console.error);
}

