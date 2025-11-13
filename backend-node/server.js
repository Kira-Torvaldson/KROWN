/**
 * Krown API Server - Serveur Node.js pour orchestration
 * 
 * Ce serveur expose une API REST et WebSocket pour gérer les sessions SSH
 * via le daemon C (krown-agent).
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { AgentClient } from './agent-client.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHttpsServer } from './https-server.js';

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
        
        if (!host || !username) {
            return res.status(400).json({ error: 'host et username requis' });
        }

        const result = await agentClient.sshConnect(host, port, username, password, private_key);
        
        if (result.code === 0) {
            // Émettre un événement WebSocket
            io.emit('session:connected', result.data);
            res.json(result.data);
        } else {
            res.status(500).json(result.data || { error: 'Erreur connexion SSH' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const result = await agentClient.listSessions();
        res.json(result.data || { sessions: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agentClient.sshStatus(id);
        res.json(result.data || { status: 'not_found' });
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

