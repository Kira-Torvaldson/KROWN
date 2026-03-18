import axios from 'axios'

type ErrorBody = { error?: unknown; message?: unknown; stage?: unknown }

export function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ErrorBody | undefined
    const fromBody =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : undefined

    const base = fromBody || err.message || fallback
    const stage = typeof data?.stage === 'string' ? data.stage : undefined
    return stage ? `${base} (stage: ${stage})` : base
  }

  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }

  return fallback
}

