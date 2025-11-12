import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiService } from '../services/api'
import { Session, Server } from '../types'
import { Server as ServerIcon, Plus, Terminal, Activity } from 'lucide-react'
import './Dashboard.css'

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [sessionsData, serversData] = await Promise.all([
        apiService.getSessions(),
        loadServersFromStorage(),
      ])
      setSessions(sessionsData)
      setServers(serversData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadServersFromStorage = (): Server[] => {
    const stored = localStorage.getItem('krown_servers')
    return stored ? JSON.parse(stored) : []
  }

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

  const getStatusLabel = (status: Session['status']) => {
    switch (status) {
      case 'connected':
        return 'Connecté'
      case 'connecting':
        return 'Connexion...'
      case 'error':
        return 'Erreur'
      default:
        return 'Déconnecté'
    }
  }

  if (loading) {
    return <div className="loading">Chargement...</div>
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Tableau de bord</h2>
          <p>Vue d'ensemble de vos sessions et serveurs</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/servers')}>
          <Plus size={18} />
          Nouveau serveur
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <ServerIcon size={20} />
            <h3>Serveurs configurés</h3>
          </div>
          <div className="card-content">
            <div className="stat-value">{servers.length}</div>
            <div className="stat-label">serveurs enregistrés</div>
          </div>
          <button className="card-action" onClick={() => navigate('/servers')}>
            Gérer les serveurs →
          </button>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <Activity size={20} />
            <h3>Sessions actives</h3>
          </div>
          <div className="card-content">
            <div className="stat-value">
              {sessions.filter((s) => s.status === 'connected').length}
            </div>
            <div className="stat-label">sessions ouvertes</div>
          </div>
          <button className="card-action" onClick={() => navigate('/history')}>
            Voir l'historique →
          </button>
        </div>
      </div>

      <div className="sessions-section">
        <h3>Sessions récentes</h3>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <Terminal size={48} />
            <p>Aucune session</p>
            <button className="btn-secondary" onClick={() => navigate('/servers')}>
              Créer une session
            </button>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map((session) => (
              <div key={session.id} className="session-card">
                <div className="session-info">
                  <div className="session-header">
                    <span className="session-host">{session.host}</span>
                    <span
                      className="session-status"
                      style={{ color: getStatusColor(session.status) }}
                    >
                      <Activity size={12} />
                      {getStatusLabel(session.status)}
                    </span>
                  </div>
                  <div className="session-details">
                    <span>{session.username}@{session.host}:{session.port}</span>
                    <span className="session-date">
                      {new Date(session.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                </div>
                {session.status === 'connected' && (
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/terminal/${session.id}`)}
                  >
                    <Terminal size={16} />
                    Ouvrir
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

