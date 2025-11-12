import { useEffect, useState } from 'react'
import { apiService } from '../services/api'
import { FileText, RefreshCw, Download, AlertCircle } from 'lucide-react'
import './Logs.css'

export default function Logs() {
  // Authentication disabled
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState(100)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLogs = async () => {
    // Authentication disabled
    setLoading(true)
    setError(null)
    try {
      const response = await apiService.getLogs(lines)
      setLogs(response.logs || [])
    } catch (error: any) {
      console.error('Failed to load logs:', error)
      setError(error.response?.data?.error || 'Erreur lors du chargement des logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Authentication disabled - load logs for all
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs()
      }, 5000) // Refresh every 5 seconds

      return () => clearInterval(interval)
    }
  }, [autoRefresh, lines, user])

  const downloadLogs = () => {
    const content = logs.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `krown-logs-${new Date().toISOString()}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getLogLevel = (log: string): 'info' | 'warn' | 'error' | 'debug' => {
    try {
      const parsed = JSON.parse(log)
      if (parsed.level) {
        const level = parsed.level.toLowerCase()
        if (level === 'error') return 'error'
        if (level === 'warn') return 'warn'
        if (level === 'debug') return 'debug'
      }
    } catch {
      // Not JSON, try string matching
      if (log.includes('ERROR') || log.includes('error')) return 'error'
      if (log.includes('WARN') || log.includes('warn')) return 'warn'
      if (log.includes('DEBUG') || log.includes('debug')) return 'debug'
    }
    return 'info'
  }

  return (
    <div className="logs-page">
      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      <div className="logs-header">
        <div>
          <h2>Logs système</h2>
          <p>Consultez les logs de l'application</p>
        </div>
        <div className="logs-controls">
          <div className="control-group">
            <label>
              Lignes:
              <input
                type="number"
                value={lines}
                onChange={(e) => setLines(parseInt(e.target.value) || 100)}
                min="10"
                max="1000"
                step="10"
              />
            </label>
          </div>
          <button
            className="btn-secondary"
            onClick={loadLogs}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            Actualiser
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="btn-secondary" onClick={downloadLogs}>
            <Download size={16} />
            Télécharger
          </button>
        </div>
      </div>

      <div className="logs-container">
        {loading && logs.length === 0 ? (
          <div className="loading">Chargement des logs...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <p>Aucun log disponible</p>
          </div>
        ) : (
          <div className="logs-content">
            {logs.map((log, index) => {
              const level = getLogLevel(log)
              let displayLog = log
              
              // Try to format JSON logs nicely
              try {
                const parsed = JSON.parse(log)
                displayLog = JSON.stringify(parsed, null, 2)
              } catch {
                // Not JSON, use as-is
              }
              
              return (
                <div key={index} className={`log-line log-${level}`}>
                  <pre>{displayLog}</pre>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

