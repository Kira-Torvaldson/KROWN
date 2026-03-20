/**
 * Mapping cohérent des réponses agent -> HTTP pour les routes SSH.
 * Codes agent (agent.h): OK=0, ERROR=1, INVALID_CMD=2, SSH_ERROR=3,
 * INVALID_PROTO=4, INVALID_JSON=5, TOO_LARGE=6, IO_ERROR=7
 *
 * Note SSH_ERROR (3) : réponse finale pour une commande connect SSH. Le fallback
 * keyboard-interactive est exécuté entièrement dans l’agent C avant ce code ; ce n’est
 * pas un état « partiel » que le Node pourrait faire évoluer via la socket.
 */

const AGENT = {
  OK: 0,
  ERROR: 1,
  INVALID_CMD: 2,
  SSH_ERROR: 3,
  INVALID_PROTO: 4,
  INVALID_JSON: 5,
  TOO_LARGE: 6,
  IO_ERROR: 7,
};

const SECRET_KEYS = new Set([
  'private_key',
  'password',
  'passphrase',
  'privateKey',
]);

/**
 * Retire les champs sensibles d'un objet (pour JSON d'erreur API / logs).
 */
export function sanitizeAgentDetails(data) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (SECRET_KEYS.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeAgentDetails(v) ?? {};
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function sshErrorHttpStatusAndStage(errorMsg) {
  const lower = (errorMsg || '').toLowerCase();
  const hostKeyHints = /known_hosts|host key|fingerprint|man-in-the-middle/i.test(lower);
  if (hostKeyHints) {
    return { httpStatus: 502, stage: 'ssh_host_key' };
  }
  const connectHints =
    /connexion|connection|resolve|timeout|refused|network|unreachable|no route|econnrefused|etimedout|name or service|nodename|ENOTFOUND|getaddrinfo/i.test(
      lower,
    );
  const authHints =
    /authentification|authentication|denied|authorized_keys|publickey|permission denied|auth fail|unable to authenticate|keyboard|mot de passe|password/i.test(
      lower,
    );
  if (connectHints && !authHints) {
    return { httpStatus: 502, stage: 'upstream_connect' };
  }
  if (authHints) {
    return { httpStatus: 401, stage: 'ssh_auth' };
  }
  if (connectHints) {
    return { httpStatus: 502, stage: 'upstream_connect' };
  }
  return { httpStatus: 502, stage: 'ssh_session' };
}

/**
 * @param {{ code: number, data?: object|null }} result
 * @param {{ stage?: string }} [options]
 * @returns {{ httpStatus: number, body: object }}
 */
export function mapAgentResultToHttp(result, options = {}) {
  const stageDefault = options.stage || 'agent';
  const code = result?.code;
  const raw = result?.data && typeof result.data === 'object' ? result.data : {};
  const errorMsg =
    typeof raw.error === 'string' && raw.error.length > 0
      ? raw.error
      : 'Erreur agent';

  const details = sanitizeAgentDetails(raw);

  if (code === AGENT.OK) {
    return { httpStatus: 200, body: null };
  }

  if (code === AGENT.INVALID_CMD) {
    return {
      httpStatus: 400,
      body: { error: errorMsg, code, stage: 'invalid_command', ...(details ? { details } : {}) },
    };
  }

  if (
    code === AGENT.INVALID_PROTO ||
    code === AGENT.INVALID_JSON ||
    code === AGENT.TOO_LARGE ||
    code === AGENT.IO_ERROR
  ) {
    return {
      httpStatus: 502,
      body: {
        error: errorMsg,
        code,
        stage: 'agent_protocol',
        ...(details ? { details } : {}),
      },
    };
  }

  if (code === AGENT.SSH_ERROR) {
    const plainDetails =
      typeof raw.details === 'string' && raw.details.length > 0 ? raw.details : '';
    /* Classer avec error + message libssh (ex. « n'accepte pas … mot de passe ») */
    const classifyText = `${errorMsg} ${plainDetails}`.trim();
    const { httpStatus, stage } = sshErrorHttpStatusAndStage(classifyText);
    const body = {
      error: errorMsg,
      code,
      stage,
    };
    if (plainDetails) {
      body.details = plainDetails;
    }
    if (typeof raw.auth_code === 'number') {
      body.auth_code = raw.auth_code;
    }
    if (Array.isArray(raw.auth_methods_available)) {
      body.auth_methods_available = raw.auth_methods_available;
    }
    return { httpStatus, body };
  }

  if (code === AGENT.ERROR) {
    return {
      httpStatus: 500,
      body: {
        error: errorMsg,
        code,
        stage: stageDefault,
        ...(details ? { details } : {}),
      },
    };
  }

  return {
    httpStatus: 500,
    body: {
      error: errorMsg,
      ...(code !== undefined && code !== null ? { code } : {}),
      stage: 'unknown_agent_code',
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Erreurs levées par AgentClient (socket absent, timeout, etc.)
 */
export function mapAgentTransportError(err, stage = 'agent_transport') {
  const message = err?.message || 'Erreur communication agent';
  const lower = message.toLowerCase();
  const unavailable =
    lower.includes('agent non disponible') ||
    lower.includes('doit être démarré') ||
    lower.includes('enoent') ||
    lower.includes('econnrefused');

  if (unavailable) {
    return {
      httpStatus: 503,
      body: {
        error: 'Agent SSH non disponible. Vérifiez que krown-agent est démarré.',
        stage: 'agent_unavailable',
        details: { hint: message },
      },
    };
  }

  if (lower.includes('timeout')) {
    return {
      httpStatus: 502,
      body: { error: message, stage: `${stage}_timeout` },
    };
  }

  return {
    httpStatus: 502,
    body: { error: message, stage },
  };
}
