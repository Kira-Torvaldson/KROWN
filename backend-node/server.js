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
        const { host, port = 22, username, password, private_key } = req.body;
        
        console.log('[API] Tentative de connexion SSH:', { 
            host, 
            port, 
            username, 
            hasPassword: !!password, 
            passwordLength: password ? password.length : 0,
            hasKey: !!private_key 
        });
        
        if (!host || !username) {
            return res.status(400).json({ error: 'host et username requis' });
        }

        // Vérifier que l'agent est disponible
        if (!agentClient.isAvailable()) {
            console.error('[API] Agent non disponible pour la connexion SSH');
            console.error('[API] Socket attendu:', AGENT_SOCKET);
            console.error('[API] Tentative de démarrage automatique de l\'agent...');
            
            // Tenter de démarrer l'agent automatiquement
            await ensureAgentRunning();
            
            // Réessayer après un court délai
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!agentClient.isAvailable()) {
                return res.status(503).json({ 
                    error: 'Agent SSH non disponible. Vérifiez que krown-agent est démarré.',
                    socket_path: AGENT_SOCKET,
                    hint: 'En Docker, vérifiez que le service agent est démarré: docker compose ps agent'
                });
            }
            
            console.log('[API] Agent maintenant disponible après démarrage automatique');
        }

        console.log('[API] Envoi de la commande SSH_CONNECT à l\'agent...');
        const result = await agentClient.sshConnect(host, port, username, password, private_key);
        
        console.log('[API] Réponse de l\'agent:', { code: result.code, data: result.data });
        
        if (result.code === 0) {
            // Transformer la réponse de l'agent pour correspondre au format Session
            const agentData = result.data || {};
            const session = {
                id: agentData.session_id || `session_${Date.now()}`,
                user_id: 'system', // Pas d'authentification pour le moment
                host: agentData.host || host,
                port: agentData.port || port,
                username: username,
                status: agentData.status || 'connected',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            console.log('[API] Session créée avec succès:', session.id);
            
            // Émettre un événement WebSocket
            io.emit('session:connected', session);
            res.json(session);
        } else {
            const errorMsg = result.data?.error || 'Erreur connexion SSH';
            console.error('[API] Erreur de l\'agent:', { code: result.code, error: errorMsg });
            res.status(500).json({ 
                error: errorMsg,
                code: result.code,
                details: result.data 
            });
        }
    } catch (error) {
        console.error('[API] Erreur création session:', error);
        console.error('[API] Stack trace:', error.stack);
        res.status(500).json({ 
            error: error.message || 'Erreur interne lors de la création de la session',
            type: error.constructor.name
        });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const result = await agentClient.listSessions();
        const agentData = result.data || { sessions: [] };
        
        // Transformer les sessions pour correspondre au format attendu
        const sessions = (agentData.sessions || []).map(s => ({
            id: s.id || s.session_id,
            user_id: 'system',
            host: s.host || 'unknown',
            port: s.port || 22,
            username: s.username || 'unknown',
            status: s.status || 'connected',
            created_at: s.created_at ? new Date(s.created_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agentClient.sshStatus(id);
        const agentData = result.data || {};
        
        if (agentData.status === 'not_found') {
            return res.status(404).json({ error: 'Session non trouvée' });
        }
        
        // Transformer pour correspondre au format Session
        const session = {
            id: id,
            user_id: 'system',
            host: agentData.host || 'unknown',
            port: agentData.port || 22,
            username: agentData.username || 'unknown',
            status: agentData.status || 'connected',
            created_at: agentData.created_at ? new Date(agentData.created_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agentClient.sshDisconnect(id);
        
        if (result.code === 0) {
            io.emit('session:disconnected', { session_id: id });
            res.json({ status: 'disconnected' });
        } else {
            res.status(500).json(result.data || { error: 'Erreur déconnexion' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Exécution de commandes
app.post('/api/sessions/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const { command } = req.body;
        
        if (!command) {
            return res.status(400).json({ error: 'command requis' });
        }

        const result = await agentClient.sshExecute(id, command);
        
        if (result.code === 0) {
            // Émettre la sortie via WebSocket
            io.emit('session:output', {
                session_id: id,
                output: result.data.output,
                exit_code: result.data.exit_code
            });
            res.json(result.data);
        } else {
            res.status(500).json(result.data || { error: 'Erreur exécution' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    console.log(`[WebSocket] Client connecté: ${socket.id}`);

    socket.emit('welcome', {
        message: 'Connecté à Krown API',
        agent_available: agentClient.isAvailable()
    });

    socket.on('disconnect', () => {
        console.log(`[WebSocket] Client déconnecté: ${socket.id}`);
    });

    // Subscription à une session
    socket.on('subscribe:session', (sessionId) => {
        socket.join(`session:${sessionId}`);
        console.log(`[WebSocket] Client ${socket.id} abonné à session ${sessionId}`);
    });
});

// Démarrer le serveur
async function start() {
    await ensureAgentRunning();
    
    const isHttps = USE_HTTPS && httpServer instanceof https.Server;
    const protocol = isHttps ? 'https' : 'http';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const listenPort = isHttps ? HTTPS_PORT : PORT;
    
    httpServer.listen(listenPort, () => {
        console.log('=== Krown API Server ===');
        console.log(`[API] Serveur démarré sur ${protocol}://localhost:${listenPort}`);
        console.log(`[API] Agent socket: ${AGENT_SOCKET}`);
        console.log(`[API] WebSocket disponible sur ${wsProtocol}://localhost:${listenPort}`);
    });
}

start().catch(console.error);

