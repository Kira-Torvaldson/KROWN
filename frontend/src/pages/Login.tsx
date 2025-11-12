import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, Lock, User, CheckCircle } from 'lucide-react'
import './Login.css'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Check for success message from registration
    if (location.state?.message) {
      setSuccess(location.state.message)
      // Clear the state to avoid showing the message again on refresh
      window.history.replaceState({}, document.title)
    }
  }, [location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(username, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Lock size={32} />
          </div>
          <h1>Krown</h1>
          <p>Gestion centralisée de sessions SSH</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {success && (
            <div className="success-message">
              <CheckCircle size={18} />
              {success}
            </div>
          )}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">
              <User size={18} />
              Nom d'utilisateur
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Entrez votre nom d'utilisateur"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <Lock size={18} />
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Entrez votre mot de passe"
            />
          </div>

          <button type="submit" disabled={loading} className="login-button">
            {loading ? (
              'Connexion...'
            ) : (
              <>
                <LogIn size={18} />
                Se connecter
              </>
            )}
          </button>

          <div className="login-footer">
            <p>
              Pas encore de compte ?{' '}
              <Link to="/register">Créer un compte</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

