/**
 * Script de test pour vérifier la communication avec l'agent C
 */

import { AgentClient } from './agent-client.js';

const client = new AgentClient();

async function test() {
    console.log('=== Test Agent Client ===\n');
    let failures = 0;

    // Test 1: Ping
    console.log('1. Test Ping...');
    try {
        const ping = await client.ping();
        console.log('✓ Ping réussi:', ping.data);
    } catch (error) {
        console.error('✗ Ping échoué:', error.message);
        failures++;
    }

    // Test 2: Liste des sessions
    console.log('\n2. Test Liste Sessions...');
    try {
        const sessions = await client.listSessions();
        console.log('✓ Sessions:', sessions.data);
    } catch (error) {
        console.error('✗ Liste sessions échouée:', error.message);
        failures++;
    }

    console.log('\n=== Tests terminés ===');
    if (failures > 0) {
        console.error(`Échec: ${failures} test(s) en erreur.`);
        process.exitCode = 1;
    } else {
        console.log('Succès: tous les tests sont passés.');
    }
}

test().catch((err) => {
    console.error('Erreur inattendue:', err?.message || err);
    process.exitCode = 1;
});

