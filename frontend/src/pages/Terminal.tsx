import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { apiService } from '../services/api'
import { wsService } from '../services/websocket'
import type { Session } from '../types'
import { getApiErrorMessage } from '../utils/apiError'
import { loadTerminalPrefs } from '../utils/terminalPrefs'
import { ArrowLeft, Trash2 } from 'lucide-react'
import 'xterm/css/xterm.css'
import './Terminal.css'

function decodePtyBase64(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function formatStreamError(message: string, stage?: string) {
  return stage ? `${message} (stage: ${stage})` : message
}

export default function Terminal() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const token: string | null = null
  const navigate = useNavigate()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const shellReadyRef = useRef(false)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [boot, setBoot] = useState<'loading' | 'ready' | 'fail'>('loading')
  const [statusLine, setStatusLine] = useState('Vérification de la session…')

  const sendResize = useCallback(() => {
    const fit = fitAddonRef.current
    if (!fit || !shellReadyRef.current) return
    const d = fit.proposeDimensions()
    if (d?.cols && d?.rows) {
      wsService.sendStreamResize(d.cols, d.rows)
    }
  }, [])

  const initTerminal = useCallback(() => {
    if (!terminalRef.current || xtermRef.current) return

    const prefs = loadTerminalPrefs()
    const xterm = new XTerm({
      theme: {
        background: prefs.themeBg,
        foreground: prefs.themeFg,
        cursor: prefs.themeCursor,
      },
      fontSize: prefs.fontSize,
      fontFamily: prefs.fontFamily,
      cursorBlink: prefs.cursorBlink,
      cursorStyle: prefs.cursorStyle,
      scrollback: prefs.scrollback,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(new WebLinksAddon())

    xterm.open(terminalRef.current)
    fitAddon.fit()

    xterm.writeln('\x1b[90mKrown — shell SSH interactif (PTY)\x1b[0m')
    xterm.writeln('')

    xterm.onData((data) => {
      if (shellReadyRef.current) {
        wsService.sendPtyInput(data)
      }
    })

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const onWinResize = () => {
      fitAddon.fit()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => sendResize(), 120)
    }
    window.addEventListener('resize', onWinResize)

    return () => {
      window.removeEventListener('resize', onWinResize)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [sendResize])

  const connectPtyStream = useCallback((): (() => void) | void => {
    if (!sessionId) return
    shellReadyRef.current = false
    wsService.connectStream(sessionId, token)

    const stream = wsService.streamWs
    if (!stream) return

    const onOpen = () => {
      const fit = fitAddonRef.current
      fit?.fit()
      const d = fit?.proposeDimensions()
      wsService.sendStreamInit(d?.cols ?? 80, d?.rows ?? 24)
    }

    if (stream.readyState === WebSocket.OPEN) {
      onOpen()
    } else {
      stream.addEventListener('open', onOpen, { once: true })
    }

    const asRec = (v: unknown): Record<string, unknown> | null =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : null

    const unsubs: Array<() => void> = []
    unsubs.push(
      wsService.on('pty', (msg: unknown) => {
        const m = asRec(msg)
        const b64 = typeof m?.data === 'string' ? m.data : ''
        if (b64 && xtermRef.current) {
          xtermRef.current.write(decodePtyBase64(b64))
        }
      }),
    )
    unsubs.push(
      wsService.on('shell_ready', () => {
        shellReadyRef.current = true
        setStatusLine('Shell prêt')
        sendResize()
      }),
    )
    unsubs.push(
      wsService.on('pty_eof', () => {
        shellReadyRef.current = false
        setStatusLine('Shell fermé (EOF)')
        xtermRef.current?.write('\r\n\x1b[33m[Session shell terminée]\x1b[0m\r\n')
      }),
    )
    unsubs.push(
      wsService.on('error', (msg: unknown) => {
        const m = asRec(msg)
        const err =
          (typeof m?.message === 'string' ? m.message : null) ||
          (typeof (asRec(m?.payload)?.message) === 'string'
            ? (asRec(m?.payload)?.message as string)
            : 'Erreur stream')
        const stage = typeof m?.stage === 'string' ? m.stage : undefined
        const line = formatStreamError(err, stage)
        setStatusLine(`Erreur: ${line}`)
        xtermRef.current?.write(`\r\n\x1b[31m[${line}]\x1b[0m\r\n`)
      }),
    )
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [sessionId, token, sendResize])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiService.getSession(sessionId)
        if (cancelled) return
        if (data.status !== 'connected') {
          setStatusLine('Session non connectée')
          alert("La session n'est pas connectée ou a été fermée.")
          navigate('/')
          setBoot('fail')
          return
        }
        setSession(data)
        setBoot('ready')
        setStatusLine('Ouverture du terminal…')
      } catch (e) {
        if (!cancelled) {
          alert(getApiErrorMessage(e, 'Impossible de charger la session'))
          navigate('/')
          setBoot('fail')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [navigate, sessionId])

  useLayoutEffect(() => {
    if (boot !== 'ready' || !sessionId) return
    const el = terminalRef.current
    if (!el) return

    const cleanupWin = initTerminal()
    const unsubWs = connectPtyStream()

    return () => {
      shellReadyRef.current = false
      unsubWs?.()
      wsService.disconnectStream()
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
      cleanupWin?.()
    }
  }, [boot, sessionId, connectPtyStream, initTerminal])

  const clearTerminal = () => {
    xtermRef.current?.clear()
  }

  if (boot === 'loading') {
    return <div className="loading">Chargement de la session…</div>
  }

  if (boot === 'fail' || !session) {
    return null
  }

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div className="terminal-info">
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
            Retour
          </button>
          <div className="session-info">
            <span className="session-title">{session.host}</span>
            <span className={`session-status ${session.status}`}>
              {session.status === 'connected' ? '● Connecté' : '○ Déconnecté'}
            </span>
            <span className="terminal-status-hint" title="État du canal PTY">
              {statusLine}
            </span>
          </div>
        </div>
        <button className="clear-button" onClick={clearTerminal} title="Effacer l’affichage">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="terminal-container">
        <div ref={terminalRef} className="xterm-wrapper" />
      </div>

      <div className="terminal-footer-hint">
        Clavier direct dans le terminal · Redimensionnement synchronisé avec le PTY distant
      </div>
    </div>
  )
}
