import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiService } from '../services/api'
import { UserPlus, Lock, User, Mail, AlertCircle } from 'lucide-react'
import './Register.css'

export default function Register() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    role: 'operator' as 'admin' | 'operator' | 'readonly',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (formData.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    if (formData.username.length < 3) {
      setError('Le nom d\'utilisateur doit contenir au moins 3 caractères')
      return
    }

    setLoading(true)

    try {
      const registerData: {
        username: string
        password: string
        email?: string
        role: 'admin' | 'operator' | 'readonly'
      } = {
        username: formData.username,
        password: formData.password,
        role: formData.role,
      }
      
      // Only include email if it's not empty
      if (formData.email && formData.email.trim() !== '') {
        registerData.email = formData.email.trim()
      }
      
      await apiService.register(registerData)

      // Rediriger vers la page de connexion avec un message
      navigate('/login', { state: { message: 'Compte créé avec succès ! Vous pouvez maintenant vous connecter.' } })
    } catch (err: any) {
      console.error('Registration error:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Erreur lors de la création du compte'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <div className="register-logo">
            <UserPlus size={32} />
          </div>
          <h1>Créer un compte</h1>
          <p>Rejoignez Krown pour gérer vos sessions SSH</p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">
              <User size={18} />
              Nom d'utilisateur *
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              minLength={3}
              autoComplete="username"
              placeholder="Choisissez un nom d'utilisateur"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">
              <Mail size={18} />
              Email (optionnel)
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              autoComplete="email"
              placeholder="votre@email.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <Lock size={18} />
              Mot de passe *
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Au moins 8 caractères"
            />
            <div className="password-hint">
              Minimum 8 caractères
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">
              <Lock size={18} />
              Confirmer le mot de passe *
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              autoComplete="new-password"
              placeholder="Répétez le mot de passe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">
              Rôle
            </label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            >
              <option value="operator">Opérateur</option>
              <option value="readonly">Lecture seule</option>
              <option value="admin">Administrateur</option>
            </select>
            <div className="role-hint">
              <strong>Opérateur :</strong> Peut créer et gérer des sessions SSH<br />
              <strong>Lecture seule :</strong> Peut uniquement consulter<br />
              <strong>Administrateur :</strong> Accès complet (y compris les logs)
            </div>
          </div>

          <button type="submit" disabled={loading} className="register-button">
            {loading ? (
              'Création du compte...'
            ) : (
              <>
                <UserPlus size={18} />
                Créer le compte
              </>
            )}
          </button>

          <div className="register-footer">
            <p>
              Vous avez déjà un compte ?{' '}
              <Link to="/login">Se connecter</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

