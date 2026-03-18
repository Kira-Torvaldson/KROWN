import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { apiService } from '../services/api'
import { wsService } from '../services/websocket'
// Authentication disabled
import { Session, CommandExecution } from '../types'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import { getApiErrorMessage } from '../utils/apiError'
import 'xterm/css/xterm.css'
import './Terminal.css'

export default function Terminal() {
  const { sessionId } = useParams<{ sessionId: string }>()
  // Authentication disabled - no token needed
  const token: string | null = null
  const navigate = useNavigate()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [loading, setLoading] = useState(true)
  const initTerminal = useCallback(() => {
    if (!terminalRef.current) return

    const xterm = new XTerm({
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#3b82f6',
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)

    xterm.open(terminalRef.current)
    fitAddon.fit()

    xterm.writeln('Krown Terminal - Session SSH')
    xterm.writeln('Tapez vos commandes dans le champ ci-dessous')
    xterm.writeln('')

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await apiService.getSession(sessionId)
      setSession(data)
      if (data.status !== 'connected') {
        alert("La session n'est pas connectée")
        navigate('/')
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }, [navigate, sessionId])

  const connectStream = useCallback(() => {
    if (!sessionId) return

    wsService.connectStream(sessionId, token)

    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : null

    const pickString = (obj: Record<string, unknown> | null, key: string) =>
      obj && typeof obj[key] === 'string' ? (obj[key] as string) : undefined

    const pickNumber = (obj: Record<string, unknown> | null, key: string) =>
      obj && typeof obj[key] === 'number' ? (obj[key] as number) : undefined

    wsService.on('output', (message: unknown) => {
      const msg = asRecord(message)
      const payload = asRecord(msg?.payload)
      const msgSessionId = pickString(payload, 'session_id') ?? pickString(msg, 'session_id')
      if (msgSessionId === sessionId && xtermRef.current) {
        const stream = pickString(payload, 'stream') ?? pickString(msg, 'stream')
        const data = pickString(payload, 'data') ?? pickString(msg, 'data') ?? ''
        if (stream === 'stderr') {
          xtermRef.current.write(`\x1b[31m${data}\x1b[0m`)
        } else {
          xtermRef.current.write(data)
        }
      }
    })

    wsService.on('command_complete', (message: unknown) => {
      const msg = asRecord(message)
      const payload = asRecord(msg?.payload)
      const msgSessionId = pickString(payload, 'session_id') ?? pickString(msg, 'session_id')
      if (msgSessionId === sessionId && xtermRef.current) {
        const exitCode = pickNumber(payload, 'exit_code') ?? pickNumber(msg, 'exit_code')
        xtermRef.current.write(`\r\n[Commande terminée avec le code: ${exitCode ?? 'N/A'}]\r\n`)
        xtermRef.current.write('$ ')
      }
    })

    wsService.on('session_status', (message: unknown) => {
      const msg = asRecord(message)
      const payload = asRecord(msg?.payload)
      const msgSessionId = pickString(payload, 'session_id') ?? pickString(msg, 'session_id')
      if (msgSessionId === sessionId) {
        const status = pickString(payload, 'status') ?? pickString(msg, 'status')
        if (status === 'disconnected' || status === 'error') {
          xtermRef.current?.write('\r\n[Session fermée]\r\n')
          setSession((prev) => (prev ? { ...prev, status } : null))
        }
      }
    })

    wsService.on('error', (message: unknown) => {
      const msg = asRecord(message)
      const payload = asRecord(msg?.payload)
      const errMsg = pickString(msg, 'message') ?? pickString(payload, 'message') ?? 'Erreur inconnue'
      xtermRef.current?.write(`\r\n[Erreur: ${errMsg}]\r\n`)
      xtermRef.current?.write('$ ')
    })

    wsService.on('welcome', (message: unknown) => {
      const msg = asRecord(message)
      const payload = asRecord(msg?.payload)
      const welcomeMsg = pickString(msg, 'message') ?? pickString(payload, 'message')
      if (welcomeMsg) {
        xtermRef.current?.write(`\r\n${welcomeMsg}\r\n`)
        xtermRef.current?.write('$ ')
      }
    })
  }, [sessionId, token])

  useEffect(() => {
    if (!sessionId) return

    const cleanupResize = initTerminal()
    void loadSession()
    connectStream()

    return () => {
      wsService.disconnectStream()
      if (xtermRef.current) {
        xtermRef.current.dispose()
      }
      cleanupResize?.()
    }
  }, [connectStream, initTerminal, loadSession, sessionId])

  const executeCommand = async () => {
    if (!command.trim() || !sessionId) return

    const cmd = command.trim()
    setCommandHistory((prev) => [...prev, cmd])
    setHistoryIndex(-1)

    if (xtermRef.current) {
      xtermRef.current.write(`\r\n$ ${cmd}\r\n`)
    }

    // Send command via WebSocket stream for real-time output
    if (wsService.streamWs?.readyState === WebSocket.OPEN) {
      wsService.sendStreamCommand(cmd)
    } else {
      // Fallback to REST API if WebSocket is not available
      try {
        const result: CommandExecution = await apiService.executeCommand(sessionId, cmd)

        if (xtermRef.current) {
          if (result.stdout) {
            xtermRef.current.write(result.stdout)
          }
          if (result.stderr) {
            xtermRef.current.write(`\r\n[stderr]\r\n${result.stderr}`)
          }
          if (result.exit_code !== undefined) {
            xtermRef.current.write(`\r\n[Code de sortie: ${result.exit_code}]\r\n`)
          }
          xtermRef.current.write('$ ')
        }
      } catch (err: unknown) {
        if (xtermRef.current) {
          xtermRef.current.write(`\r\n[Erreur: ${getApiErrorMessage(err, 'Erreur inconnue')}]\r\n`)
          xtermRef.current.write('$ ')
        }
      }
    }

    setCommand('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setCommand('')
        } else {
          setHistoryIndex(newIndex)
          setCommand(commandHistory[newIndex])
        }
      }
    }
  }

  const clearTerminal = () => {
    if (xtermRef.current) {
      xtermRef.current.clear()
      xtermRef.current.write('$ ')
    }
  }

  if (loading) {
    return <div className="loading">Chargement de la session...</div>
  }

  if (!session) {
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
          </div>
        </div>
        <button className="clear-button" onClick={clearTerminal} title="Effacer le terminal">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="terminal-container">
        <div ref={terminalRef} className="xterm-wrapper" />
      </div>

      <div className="command-input-container">
        <div className="command-prompt">$</div>
        <input
          type="text"
          className="command-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tapez une commande..."
          autoFocus
        />
        <button className="send-button" onClick={executeCommand} disabled={!command.trim()}>
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
