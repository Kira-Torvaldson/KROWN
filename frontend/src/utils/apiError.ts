import axios from 'axios'

type ErrorBody = { error?: unknown; message?: unknown }

export function getApiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ErrorBody | undefined
    const fromBody =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : undefined
    return fromBody || err.message || fallback
  }

  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }

  return fallback
}

