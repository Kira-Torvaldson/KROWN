/**
 * Smoke E2E terminal PTY (optionnel).
 * Prérequis : krown-agent + API démarrés, SSH joignable par clé.
 *
 *   KROWN_E2E_TERMINAL=1 \
 *   KROWN_E2E_API=http://127.0.0.1:8080 \
 *   KROWN_E2E_HOST=... KROWN_E2E_USER=... KROWN_E2E_KEY_FILE=/path/to/key \
 *   node tests/terminal-pty-smoke.js
 *
 * Sans KROWN_E2E_TERMINAL=1 : sortie 0 (skip).
 */
import { readFileSync, existsSync } from 'fs'
import WebSocket from 'ws'

const API = process.env.KROWN_E2E_API || 'http://127.0.0.1:8080'
const HOST = process.env.KROWN_E2E_HOST
const USER = process.env.KROWN_E2E_USER
const KEY_FILE = process.env.KROWN_E2E_KEY_FILE

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (process.env.KROWN_E2E_TERMINAL !== '1') {
    console.log('SKIP: définir KROWN_E2E_TERMINAL=1 pour exécuter le smoke PTY')
    return
  }
  if (!HOST || !USER || !KEY_FILE || !existsSync(KEY_FILE)) {
    console.error('Variables requises: KROWN_E2E_HOST, KROWN_E2E_USER, KROWN_E2E_KEY_FILE')
    process.exitCode = 1
    return
  }

  const private_key = readFileSync(KEY_FILE, 'utf8')
  const port = parseInt(process.env.KROWN_E2E_PORT || '22', 10)

  const res = await fetch(`${API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: HOST, port, username: USER, private_key }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('POST /api/sessions failed:', res.status, body)
    process.exitCode = 1
    return
  }
  const sessionId = body.id
  if (!sessionId) {
    console.error('Pas de session id dans la réponse')
    process.exitCode = 1
    return
  }

  const wsUrl = API.replace(/^http/, 'ws') + `/api/ssh/${encodeURIComponent(sessionId)}/stream`
  const collected = []
  let stage = 0

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      clearTimeout(to)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve()
    }

    const to = setTimeout(() => finish(new Error('timeout smoke PTY (120s)')), 120000)

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'init', cols: 100, rows: 30 }))
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.event === 'error') {
          finish(new Error(msg.message || 'ws error'))
          return
        }
        if (msg.event === 'shell_ready') {
          stage = 1
          ws.send(JSON.stringify({ type: 'input', data: 'whoami\r' }))
          return
        }
        if (msg.event === 'pty' && msg.data && stage >= 1) {
          try {
            collected.push(Buffer.from(msg.data, 'base64').toString('utf8'))
          } catch {
            /* ignore */
          }
          const joined = collected.join('')
          if (stage === 1 && joined.includes(USER)) {
            stage = 2
            ws.send(JSON.stringify({ type: 'resize', cols: 72, rows: 20 }))
            void sleep(600).then(() => finish(null))
          }
        }
      } catch (e) {
        finish(e)
      }
    })

    ws.on('error', (e) => finish(e))
  })

  const out = collected.join('')
  if (!out.includes(USER)) {
    console.error('Sortie PTY sans nom utilisateur attendu:', USER)
    process.exitCode = 1
  } else {
    console.log('OK terminal PTY smoke (whoami + resize + fermeture)')
  }

  await fetch(`${API}/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {})
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exitCode = 1
})
