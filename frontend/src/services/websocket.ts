import type { Session } from '../types'

export type WebSocketMessage =
  | { event: 'welcome'; message?: string; payload?: { message: string } }
  | { event: 'authenticated'; user_id?: string; username?: string; payload?: { user_id: string; username: string } }
  | { event: 'subscribed'; session_id?: string; payload?: { session_id: string } }
  | { event: 'output'; session_id?: string; stream?: 'stdout' | 'stderr'; data?: string; payload?: { session_id: string; stream: string; data: string } }
  | { event: 'command_complete'; session_id?: string; exit_code?: number; payload?: { session_id: string; exit_code: number } }
  | { event: 'session_status'; session_id?: string; status?: string; payload?: { session_id: string; status: string } }
  | { event: 'error'; message?: string; payload?: { message: string } }
  | { event: 'pong' }

export class WebSocketService {
  private ws: WebSocket | null = null
  public streamWs: WebSocket | null = null
  private baseUrl: string
  private token: string | null = null
  private listeners: Map<string, Set<(data: any) => void>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = import.meta.env.VITE_WS_URL || 'localhost:8080'
    this.baseUrl = `${wsProtocol}//${wsHost}`
  }

  connect(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.token = token
    this.ws = new WebSocket(`${this.baseUrl}/ws`)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.authenticate()
    }

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        this.handleMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.attemptReconnect()
    }
  }

  private authenticate() {
    if (this.ws && this.token) {
      this.send({
        type: 'authenticate',
        token: this.token,
      })
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.token) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`)
        this.connect(this.token!)
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }

  private handleMessage(message: WebSocketMessage) {
    const eventType = (message as any).event || (message as any).type
    const listeners = this.listeners.get(eventType) || new Set()
    listeners.forEach((listener) => listener(message))
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.warn('WebSocket is not open')
    }
  }

  subscribe(sessionId: string) {
    this.send({
      type: 'subscribe_session',
      session_id: sessionId,
    })
  }

  on<T extends WebSocketMessage>(type: string, callback: (data: T) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(callback as any)

    return () => {
      this.listeners.get(type)?.delete(callback as any)
    }
  }

  ping() {
    this.send({ type: 'ping' })
  }

  // Stream connection for SSH session output
  connectStream(sessionId: string, token: string | null = null) {
    if (this.streamWs?.readyState === WebSocket.OPEN) {
      this.disconnectStream()
    }

    // Authentication disabled - token not needed
    this.token = token
    const url = `${this.baseUrl}/api/ssh/${sessionId}/stream`
    this.streamWs = new WebSocket(url)

    this.streamWs.onopen = () => {
      console.log('WebSocket stream connected for session:', sessionId)
      this.reconnectAttempts = 0
    }

    this.streamWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const eventType = message.event || message.type
        const listeners = this.listeners.get(eventType) || new Set()
        listeners.forEach((listener) => listener(message))
      } catch (error) {
        console.error('Failed to parse stream message:', error)
      }
    }

    this.streamWs.onerror = (error) => {
      console.error('WebSocket stream error:', error)
    }

    this.streamWs.onclose = () => {
      console.log('WebSocket stream disconnected')
      this.attemptReconnectStream(sessionId)
    }
  }

  private attemptReconnectStream(sessionId: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.token) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Reconnecting stream... (attempt ${this.reconnectAttempts})`)
        this.connectStream(sessionId, this.token!)
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }

  sendStreamCommand(command: string) {
    if (this.streamWs?.readyState === WebSocket.OPEN) {
      this.streamWs.send(JSON.stringify({ command }))
    } else {
      console.warn('Stream WebSocket is not open')
    }
  }

  disconnectStream() {
    if (this.streamWs) {
      this.streamWs.close()
      this.streamWs = null
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.disconnectStream()
    this.listeners.clear()
  }
}

export const wsService = new WebSocketService()

