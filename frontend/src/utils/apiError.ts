import axios from 'axios'

type ErrorBody = { error?: unknown; message?: unknown; stage?: unknown; details?: unknown }

/** Extrait un message lisible du corps de réponse API (objet, JSON string, champs imbriqués). */
function extractMessageFromBody(data: unknown): string | undefined {
  if (data == null) return undefined
  if (typeof data === 'string') {
    const t = data.trim()
    if (t.startsWith('{')) {
      try {
        return extractMessageFromBody(JSON.parse(t) as unknown)
      } catch {
        return t || undefined
      }
    }
    return t || undefined
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.length > 0) return o.error
    if (typeof o.message === 'string' && o.message.length > 0) return o.message
    if (typeof o.details === 'string' && o.details.length > 0) return o.details
  }
  return undefined
}

function extractStage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'stage' in data) {
    const s = (data as ErrorBody).stage
    return typeof s === 'string' ? s : undefined
  }
  return undefined
}

export function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data
    const fromBody = extractMessageFromBody(data)
    const stage = extractStage(data)

    // 401 sur /api/sessions = souvent échec auth SSH (backend), pas JWT : message explicite si corps vide
    const base =
      fromBody ||
      (status === 401
        ? 'Authentification SSH refusée ou incorrecte (utilisateur, mot de passe ou clé).'
        : undefined) ||
      err.message ||
      fallback

    return stage ? `${base} (stage: ${stage})` : base
  }

  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }

  return fallback
}
