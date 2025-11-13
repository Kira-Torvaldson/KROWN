import axios, { AxiosInstance } from 'axios'
import type {
  User,
  Server,
  Session,
  CommandExecution,
  LoginRequest,
  LoginResponse,
  CreateSessionRequest,
  ExecuteCommandRequest,
  CreateServerRequest,
  UpdateServerRequest,
} from '../types'

// Use relative URL to leverage Vite proxy in development
// In production, set VITE_API_URL environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

class ApiService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Authentication disabled - no token needed
    // this.client.interceptors.request.use((config) => {
    //   const token = localStorage.getItem('krown_token')
    //   if (token) {
    //     config.headers.Authorization = `Bearer ${token}`
    //   }
    //   return config
    // })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('krown_token')
          localStorage.removeItem('krown_user')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  setToken(token: string | null) {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete this.client.defaults.headers.common['Authorization']
    }
  }

  // Auth endpoints
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/api/auth/login', {
      username,
      password,
    })
    return response.data
  }

  async register(data: { username: string; password: string; email?: string; role: 'admin' | 'operator' | 'readonly' }): Promise<User> {
    const response = await this.client.post<User>('/api/auth/register', {
      username: data.username,
      password: data.password,
      email: data.email,
      role: data.role,
    })
    return response.data
  }

  // Session endpoints
  async getSessions(): Promise<Session[]> {
    const response = await this.client.get<Session[]>('/api/sessions')
    return response.data
  }

  async getSession(id: string): Promise<Session> {
    const response = await this.client.get<Session>(`/api/sessions/${id}`)
    return response.data
  }

  async createSession(data: CreateSessionRequest): Promise<Session> {
    const response = await this.client.post<Session>('/api/sessions', data)
    return response.data
  }

  async deleteSession(id: string): Promise<void> {
    await this.client.delete(`/api/sessions/${id}`)
  }

  async executeCommand(sessionId: string, command: string, timeout?: number): Promise<CommandExecution> {
    const response = await this.client.post<CommandExecution>(
      `/api/sessions/${sessionId}/execute`,
      { command, timeout_secs: timeout } as ExecuteCommandRequest
    )
    return response.data
  }

  // Server endpoints
  async getServers(): Promise<Server[]> {
    const response = await this.client.get<Server[]>('/api/servers')
    return response.data
  }

  async getServer(id: string): Promise<Server> {
    const response = await this.client.get<Server>(`/api/servers/${id}`)
    return response.data
  }

  async createServer(data: CreateServerRequest): Promise<Server> {
    const response = await this.client.post<Server>('/api/servers', data)
    return response.data
  }

  async updateServer(id: string, data: UpdateServerRequest): Promise<Server> {
    const response = await this.client.put<Server>(`/api/servers/${id}`, data)
    return response.data
  }

  async deleteServer(id: string): Promise<void> {
    await this.client.delete(`/api/servers/${id}`)
  }

  async connectSsh(serverId: string): Promise<Session> {
    const response = await this.client.post<Session>(`/api/ssh/${serverId}/connect`)
    return response.data
  }

  async getCommandHistory(sessionId: string): Promise<CommandExecution[]> {
    const response = await this.client.get<CommandExecution[]>(`/api/sessions/${sessionId}/history`)
    return response.data
  }

  // Logs endpoint
  async getLogs(lines: number = 100, file: string = 'krown.log'): Promise<{ logs: string[]; total_lines: number; returned_lines: number }> {
    const response = await this.client.get(`/api/logs`, {
      params: { lines, file }
    })
    return response.data
  }

  // User endpoints
  async getUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/api/users')
    return response.data
  }

  async getUser(id: string): Promise<User> {
    const response = await this.client.get<User>(`/api/users/${id}`)
    return response.data
  }
}

export const apiService = new ApiService()

// Auth service (alias for convenience)
export const authService = apiService

