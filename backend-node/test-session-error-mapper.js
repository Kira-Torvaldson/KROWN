/**
 * Non-régression du mapping erreurs agent -> HTTP
 * Exécution: node test-session-error-mapper.js
 */
import assert from 'assert';
import {
  mapAgentResultToHttp,
  mapAgentTransportError,
  sanitizeAgentDetails,
} from './session-error-mapper.js';

function assertEq(a, b, msg) {
  assert.strictEqual(a, b, msg);
}

// sanitize
const dirty = { error: 'x', private_key: 'SECRET', password: 'p', nested: { passphrase: 'y' } };
const clean = sanitizeAgentDetails(dirty);
assert(!clean.private_key && !clean.password, 'sanitize doit retirer les secrets racine');
assert(!clean.nested?.passphrase, 'sanitize nested passphrase');

// SSH auth -> 401
let r = mapAgentResultToHttp({ code: 3, data: { error: 'Permission denied (publickey)' } }, { stage: 'ssh_connect' });
assertEq(r.httpStatus, 401, 'SSH auth');
assertEq(r.body.stage, 'ssh_auth');

// upstream
r = mapAgentResultToHttp({ code: 3, data: { error: 'Connection refused' } }, { stage: 'ssh_connect' });
assertEq(r.httpStatus, 502);
assertEq(r.body.stage, 'upstream_connect');

r = mapAgentResultToHttp({ code: 3, data: { error: 'ENOTFOUND example.invalid' } }, { stage: 'ssh_connect' });
assertEq(r.httpStatus, 502);
assertEq(r.body.stage, 'upstream_connect');

// protocol
r = mapAgentResultToHttp({ code: 7, data: { error: 'IO' } }, { stage: 'x' });
assertEq(r.httpStatus, 502);
assertEq(r.body.stage, 'agent_protocol');

r = mapAgentResultToHttp({ code: 2, data: { error: 'bad cmd' } }, { stage: 'x' });
assertEq(r.httpStatus, 400);
assertEq(r.body.stage, 'invalid_command');

r = mapAgentResultToHttp({ code: 1, data: { error: 'interne' } }, { stage: 'list_sessions' });
assertEq(r.httpStatus, 500);
assertEq(r.body.stage, 'list_sessions');

r = mapAgentResultToHttp({ code: 0, data: {} }, {});
assertEq(r.httpStatus, 200);
assertEq(r.body, null);

// transport
r = mapAgentTransportError(new Error('Agent non disponible. Socket'), 'ssh_connect');
assertEq(r.httpStatus, 503);
assertEq(r.body.stage, 'agent_unavailable');

r = mapAgentTransportError(new Error("Timeout: l'agent n'a pas répondu"), 'x');
assertEq(r.httpStatus, 502);
assert(r.body.stage.includes('timeout'));

// details ne doit pas exposer private_key dans la réponse mappée
r = mapAgentResultToHttp(
  { code: 3, data: { error: 'fail', private_key: 'LEAK' } },
  { stage: 'ssh_connect' },
);
assert(!JSON.stringify(r.body).includes('LEAK'), 'private_key ne doit pas apparaître dans body');

console.log('OK: test-session-error-mapper.js');
