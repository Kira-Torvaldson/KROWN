import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiService } from '../services/api'
import { Session, CommandExecution } from '../types'
import { format } from 'date-fns'
import { Terminal, Clock, Code, CheckCircle, XCircle } from 'lucide-react'
import './History.css'

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [commands, setCommands] = useState<CommandExecution[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiService.getSessions()
      const sorted = data.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setSessions(sorted)
      setSelectedSession((prev) => prev ?? (sorted.length > 0 ? sorted[0] : null))
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCommands = useCallback(async (sessionId: string) => {
    try {
      const data = await apiService.getCommandHistory(sessionId)
      setCommands(data)
    } catch (error) {
      console.error('Failed to load commands:', error)
      setCommands([])
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (selectedSession) {
      void loadCommands(selectedSession.id)
    }
  }, [loadCommands, selectedSession])

  const getStatusColor = (status: Session['status']) => {
    switch (status) {
      case 'connected':
        return 'var(--success)'
      case 'connecting':
        return 'var(--warning)'
      case 'error':
        return 'var(--error)'
      default:
        return 'var(--text-muted)'
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  if (loading) {
    return <div className="loading">Chargement de l'historique...</div>
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <div>
          <h2>Historique des sessions</h2>
          <p>Consultez l'historique de vos sessions SSH et commandes exécutées</p>
        </div>
      </div>

      <div className="history-layout">
        <div className="sessions-panel">
          <h3>Sessions</h3>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <Terminal size={32} />
              <p>Aucune session</p>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => setSelectedSession(session)}
                >
                  <div className="session-item-header">
                    <span className="session-host">{session.host}</span>
                    <span
                      className="session-status-badge"
                      style={{ color: getStatusColor(session.status) }}
                    >
                      ●
                    </span>
                  </div>
                  <div className="session-item-details">
                    <span>{session.username}@{session.host}:{session.port}</span>
                  </div>
                  <div className="session-item-date">
                    <Clock size={12} />
                    {format(new Date(session.created_at), "d MMM yyyy 'à' HH:mm")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="commands-panel">
          {selectedSession ? (
            <>
              <div className="panel-header">
                <h3>Commandes - {selectedSession.host}</h3>
                {selectedSession.status === 'connected' && (
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/terminal/${selectedSession.id}`)}
                  >
                    <Terminal size={16} />
                    Ouvrir
                  </button>
                )}
              </div>
              {commands.length === 0 ? (
                <div className="empty-state">
                  <Code size={32} />
                  <p>Aucune commande exécutée</p>
                </div>
              ) : (
                <div className="commands-list">
                  {commands.map((cmd) => (
                    <div key={cmd.id} className="command-item">
                      <div className="command-header">
                        <div className="command-info">
                          <code className="command-text">{cmd.command}</code>
                          <span className="command-meta">
                            {format(new Date(cmd.executed_at), "d MMM yyyy 'à' HH:mm:ss")}
                            {' • '}
                            {formatDuration(cmd.duration_ms)}
                          </span>
                        </div>
                        <div className="command-status">
                          {cmd.exit_code === 0 ? (
                            <CheckCircle size={18} color="var(--success)" />
                          ) : (
                            <XCircle size={18} color="var(--error)" />
                          )}
                          {cmd.exit_code !== undefined && (
                            <span>Code: {cmd.exit_code}</span>
                          )}
                        </div>
                      </div>
                      {cmd.stdout && (
                        <div className="command-output">
                          <div className="output-label">stdout:</div>
                          <pre>{cmd.stdout}</pre>
                        </div>
                      )}
                      {cmd.stderr && (
                        <div className="command-output error">
                          <div className="output-label">stderr:</div>
                          <pre>{cmd.stderr}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Terminal size={48} />
              <p>Sélectionnez une session pour voir les commandes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
