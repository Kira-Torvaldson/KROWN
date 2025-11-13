/**
 * Script de test pour vérifier la communication avec l'agent C
 */

import { AgentClient } from './agent-client.js';

const client = new AgentClient();

async function test() {
    console.log('=== Test Agent Client ===\n');

    // Test 1: Ping
    console.log('1. Test Ping...');
    try {
        const ping = await client.ping();
        console.log('✓ Ping réussi:', ping.data);
    } catch (error) {
        console.error('✗ Ping échoué:', error.message);
        return;
    }

    // Test 2: Liste des sessions
    console.log('\n2. Test Liste Sessions...');
    try {
        const sessions = await client.listSessions();
        console.log('✓ Sessions:', sessions.data);
    } catch (error) {
        console.error('✗ Liste sessions échouée:', error.message);
    }

    console.log('\n=== Tests terminés ===');
}

test().catch(console.error);

