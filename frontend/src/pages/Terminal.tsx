import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { apiService } from '../services/api'
import { wsService } from '../services/websocket'
// Authentication disabled
import { Session, CommandExecution } from '../types'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import 'xterm/css/xterm.css'
import './Terminal.css'

export default function Terminal() {
  const { sessionId } = useParams<{ sessionId: string }>()
  // Authentication disabled - no token needed
  const token = null
  const navigate = useNavigate()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return

    loadSession()
    initTerminal()
    connectStream()

    return () => {
      wsService.disconnectStream()
      if (xtermRef.current) {
        xtermRef.current.dispose()
      }
    }
  }, [sessionId])

  const loadSession = async () => {
    try {
      const data = await apiService.getSession(sessionId!)
      setSession(data)
      if (data.status !== 'connected') {
        alert('La session n\'est pas connectée')
        navigate('/')
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const initTerminal = () => {
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

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }

  const connectStream = () => {
    if (!token || !sessionId) return

    // Connect to stream WebSocket
    wsService.connectStream(sessionId, token)

    // Listen for output events
    wsService.on('output', (message: any) => {
      const payload = message.payload || message
      const msgSessionId = payload.session_id || message.session_id
      if (msgSessionId === sessionId && xtermRef.current) {
        const stream = payload.stream || message.stream
        const data = payload.data || message.data
        if (stream === 'stderr') {
          // Stderr in red (ANSI escape code)
          xtermRef.current.write(`\x1b[31m${data}\x1b[0m`)
        } else {
          xtermRef.current.write(data)
        }
      }
    })

    // Listen for command completion
    wsService.on('command_complete', (message: any) => {
      const payload = message.payload || message
      const msgSessionId = payload.session_id || message.session_id
      if (msgSessionId === sessionId && xtermRef.current) {
        const exitCode = payload.exit_code || message.exit_code
        xtermRef.current.write(`\r\n[Commande terminée avec le code: ${exitCode}]\r\n`)
        xtermRef.current.write('$ ')
      }
    })

    // Listen for session status updates
    wsService.on('session_status', (message: any) => {
      const payload = message.payload || message
      const msgSessionId = payload.session_id || message.session_id
      if (msgSessionId === sessionId) {
        const status = payload.status || message.status
        if (status === 'disconnected' || status === 'error') {
          if (xtermRef.current) {
            xtermRef.current.write('\r\n[Session fermée]\r\n')
          }
          setSession((prev) => prev ? { ...prev, status } : null)
        }
      }
    })

    // Listen for errors
    wsService.on('error', (message: any) => {
      if (xtermRef.current) {
        xtermRef.current.write(`\r\n[Erreur: ${message.message || message.payload?.message}]\r\n`)
        xtermRef.current.write('$ ')
      }
    })

    // Listen for welcome message
    wsService.on('welcome', (message: any) => {
      if (xtermRef.current) {
        xtermRef.current.write(`\r\n${message.message || message.payload?.message}\r\n`)
        xtermRef.current.write('$ ')
      }
    })
  }

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
      } catch (error: any) {
        if (xtermRef.current) {
          xtermRef.current.write(`\r\n[Erreur: ${error.response?.data?.error || 'Erreur inconnue'}]\r\n`)
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

