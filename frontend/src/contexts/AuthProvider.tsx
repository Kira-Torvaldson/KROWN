import { useEffect, useState, type ReactNode } from 'react'
import { authService } from '../services/api'
import type { User } from '../types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('krown_token')
    const storedUser = localStorage.getItem('krown_user')

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser) as User)
      authService.setToken(storedToken)
    }

    setLoading(false)
  }, [])

  const login = async (username: string, password: string) => {
    const response = await authService.login(username, password)
    setToken(response.token)
    setUser(response.user)
    localStorage.setItem('krown_token', response.token)
    localStorage.setItem('krown_user', JSON.stringify(response.user))
    authService.setToken(response.token)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('krown_token')
    localStorage.removeItem('krown_user')
    authService.setToken(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

