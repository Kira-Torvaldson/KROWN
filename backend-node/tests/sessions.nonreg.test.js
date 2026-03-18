import { startServer, stopServer } from '../server.js'

const PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : 18080
const BASE = `http://127.0.0.1:${PORT}`

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForServer(proc, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // Quick health check: server should respond (may be 503 if agent missing)
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.status === 200 || res.status === 503) return
    } catch {
      // ignore until ready
    }
    if (proc.exitCode !== null) throw new Error('Le serveur backend s’est arrêté avant le test.')
    await sleep(250)
  }
  throw new Error('Timeout: backend non prêt.')
}

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

async function main() {
  const logs = []
  try {
    await startServer({ port: PORT })

    // 1) Payload invalide -> 400 + stage payload_validation
    const invalid = await postJson('/api/sessions', { host: '', username: '' })
    if (invalid.status !== 400) {
      throw new Error(`Attendu 400 pour payload invalide, reçu ${invalid.status}. Body=${JSON.stringify(invalid.json)}`)
    }
    if (!invalid.json || typeof invalid.json.error !== 'string') {
      throw new Error(`Réponse 400 avec error, reçu: ${JSON.stringify(invalid.json)}`)
    }
    if (invalid.json.stage !== 'payload_validation') {
      throw new Error(`Attendu stage payload_validation, reçu ${invalid.json.stage}`)
    }

    // 2) Mot de passe refusé -> 400 policy_password (pas de fuite du secret dans la réponse)
    const pwd = await postJson('/api/sessions', {
      host: 'h.example',
      username: 'u',
      password: 'secret-password-never-echo',
    })
    if (pwd.status !== 400 || pwd.json?.stage !== 'policy_password') {
      throw new Error(`Attendu 400 policy_password pour password, reçu ${pwd.status} ${JSON.stringify(pwd.json)}`)
    }
    if (JSON.stringify(pwd.json).includes('secret-password')) {
      throw new Error('Le mot de passe ne doit pas être renvoyé dans le JSON')
    }

    // 3) Port invalide
    const badPort = await postJson('/api/sessions', { host: 'x', username: 'y', port: 99999 })
    if (badPort.status !== 400 || badPort.json?.stage !== 'payload_validation') {
      throw new Error(`Attendu 400 port, reçu ${badPort.status} ${JSON.stringify(badPort.json)}`)
    }

    // 4) Forme valide (clé) -> pas 400 (401/502/503 selon agent / réseau)
    const validShape = await postJson('/api/sessions', {
      host: 'example.com',
      port: 22,
      username: 'user',
      private_key: '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----\n',
    })
    if (validShape.status === 400) {
      throw new Error(`Attendu pas 400 pour payload valide-shape, reçu 400. Body=${JSON.stringify(validShape.json)}`)
    }

    console.log('OK: sessions API smoke + non-régression.')
  } finally {
    await stopServer()
    // If something failed, dump logs for diagnosis
    if (process.exitCode && logs.length) {
      console.error('\n--- backend logs ---\n' + logs.join('') + '\n--- end logs ---\n')
    }
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e)
  process.exitCode = 1
})

