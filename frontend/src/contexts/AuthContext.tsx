import { createContext } from 'react'
import type { User } from '../types'

export interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

