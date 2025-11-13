import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server } from '../types'
import { apiService } from '../services/api'
import { Plus, Edit, Trash2, Terminal, Key, Lock } from 'lucide-react'
import './ServerManager.css'

export default function ServerManager() {
  const [servers, setServers] = useState<Server[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = () => {
    const stored = localStorage.getItem('krown_servers')
    if (stored) {
      setServers(JSON.parse(stored))
    }
  }

  const saveServers = (newServers: Server[]) => {
    localStorage.setItem('krown_servers', JSON.stringify(newServers))
    setServers(newServers)
  }

  const handleCreateSession = async (server: Server) => {
    setLoading(true)
    try {
      // Le backend attend password et private_key directement dans le body
      const session = await apiService.createSession({
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.authMethod === 'password' ? server.password : undefined,
        private_key: server.authMethod === 'key' ? server.privateKey : undefined,
      })

      navigate(`/terminal/${session.id}`)
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Erreur lors de la création de la session'
      console.error('Erreur création session:', error)
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce serveur ?')) {
      const newServers = servers.filter((s) => s.id !== id)
      saveServers(newServers)
    }
  }

  return (
    <div className="server-manager">
      <div className="page-header">
        <div>
          <h2>Gestion des serveurs</h2>
          <p>Configurez et gérez vos serveurs SSH</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} />
          Nouveau serveur
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="empty-state">
          <Terminal size={48} />
          <p>Aucun serveur configuré</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            Ajouter un serveur
          </button>
        </div>
      ) : (
        <div className="servers-grid">
          {servers.map((server) => (
            <div key={server.id} className="server-card">
              <div className="server-header">
                <div className="server-name">{server.name}</div>
                <div className="server-actions">
                  <button
                    className="icon-button"
                    onClick={() => {
                      setEditingServer(server)
                      setShowModal(true)
                    }}
                    title="Modifier"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => handleDelete(server.id!)}
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="server-info">
                <div className="info-row">
                  <span className="info-label">Host:</span>
                  <span className="info-value">{server.host}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Port:</span>
                  <span className="info-value">{server.port}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Utilisateur:</span>
                  <span className="info-value">{server.username}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Authentification:</span>
                  <span className="info-value">
                    {server.authMethod === 'password' ? (
                      <><Lock size={14} /> Mot de passe</>
                    ) : (
                      <><Key size={14} /> Clé SSH</>
                    )}
                  </span>
                </div>
              </div>
              <button
                className="btn-primary full-width"
                onClick={() => handleCreateSession(server)}
                disabled={loading}
              >
                <Terminal size={16} />
                Se connecter
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ServerModal
          server={editingServer}
          onClose={() => {
            setShowModal(false)
            setEditingServer(null)
          }}
          onSave={(server) => {
            if (editingServer) {
              const newServers = servers.map((s) =>
                s.id === editingServer.id ? { ...server, id: editingServer.id } : s
              )
              saveServers(newServers)
            } else {
              const newServer = { ...server, id: crypto.randomUUID() }
              saveServers([...servers, newServer])
            }
            setShowModal(false)
            setEditingServer(null)
          }}
        />
      )}
    </div>
  )
}

function ServerModal({
  server,
  onClose,
  onSave,
}: {
  server: Server | null
  onClose: () => void
  onSave: (server: Server) => void
}) {
  const [formData, setFormData] = useState<Server>({
    name: server?.name || '',
    host: server?.host || '',
    port: server?.port || 22,
    username: server?.username || '',
    authMethod: server?.authMethod || 'password',
    password: server?.password || '',
    privateKey: server?.privateKey || '',
    passphrase: server?.passphrase || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.host || !formData.username) {
      alert('Veuillez remplir tous les champs obligatoires')
      return
    }
    onSave(formData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{server ? 'Modifier le serveur' : 'Nouveau serveur'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="server-form">
          <div className="form-group">
            <label>Nom du serveur *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Mon serveur"
              required
            />
          </div>
          <div className="form-group">
            <label>Host / IP *</label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
              placeholder="22"
            />
          </div>
          <div className="form-group">
            <label>Nom d'utilisateur *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="user"
              required
            />
          </div>
          <div className="form-group">
            <label>Méthode d'authentification</label>
            <select
              value={formData.authMethod}
              onChange={(e) => setFormData({ ...formData, authMethod: e.target.value as 'password' | 'key' })}
            >
              <option value="password">Mot de passe</option>
              <option value="key">Clé SSH privée</option>
            </select>
          </div>
          {formData.authMethod === 'password' ? (
            <div className="form-group">
              <label>Mot de passe *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Clé privée SSH *</label>
                <textarea
                  value={formData.privateKey}
                  onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                  rows={6}
                  required
                />
              </div>
              <div className="form-group">
                <label>Passphrase (optionnel)</label>
                <input
                  type="password"
                  value={formData.passphrase}
                  onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              {server ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

