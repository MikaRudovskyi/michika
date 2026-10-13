import { useAuth } from '../store/auth'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Opts {
  method?: string
  json?: unknown
  form?: URLSearchParams
  data?: FormData // file uploads: the browser sets the multipart boundary itself
  token?: string
}

export async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const token = opts.token ?? useAuth.getState().token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = opts.form
  } else if (opts.data) {
    body = opts.data
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body })
  } catch {
    throw new ApiError(0, 'Network error')
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const data = await res.json()
      const detail = data?.detail
      if (typeof detail === 'string') message = detail
      else if (Array.isArray(detail))
        message = detail.map((e: { msg: string }) => e.msg).join('; ')
    } catch {
      /* body was not JSON */
    }
    if (token && (res.status === 401 || (res.status === 403 && message === 'Account is blocked'))) {
      useAuth.getState().logout()
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Builds "?a=1&b=2", skipping empty values. */
export const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}