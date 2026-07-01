import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const http = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.reload()
    }
    const msg = err.response?.data?.detail || err.response?.data?.message || err.message || `Error ${err.response?.status}`
    return Promise.reject(new Error(msg))
  },
)

export async function api<T>(path: string, opts?: { method?: string; body?: string }): Promise<T> {
  const res = await http.request<T>({
    url: path,
    method: opts?.method || 'GET',
    data: opts?.body ? JSON.parse(opts.body) : undefined,
  })
  return res.data
}

export function fmt(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
