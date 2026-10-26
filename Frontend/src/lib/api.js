import axios from 'axios'

export const CSRF_COOKIE_NAME = 'csrftoken'
export const CSRF_HEADER_NAME = 'X-CSRFToken'

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// In production (Render static site), render.yaml rewrites /api/* to Django.
// In development, the Vite proxy forwards /api → localhost:8000.
const BASE_URL = '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  xsrfCookieName: CSRF_COOKIE_NAME,
  xsrfHeaderName: CSRF_HEADER_NAME,
  headers: { Accept: 'application/json' },
  timeout: 20000,
})

export function getCookie(name) {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

let csrfRequest = null

export function ensureCsrf() {
  const token = getCookie(CSRF_COOKIE_NAME)
  if (token) return Promise.resolve(token)

  if (!csrfRequest) {
    csrfRequest = api
      .get('/auth/csrf/')
      .then(() => getCookie(CSRF_COOKIE_NAME))
      .finally(() => {
        csrfRequest = null
      })
  }

  return csrfRequest
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  if (UNSAFE_METHODS.has(method) && !getCookie(CSRF_COOKIE_NAME)) {
    await ensureCsrf()
  }

  const token = getCookie(CSRF_COOKIE_NAME)
  if (token && UNSAFE_METHODS.has(method)) {
    config.headers[CSRF_HEADER_NAME] = token
  }

  return config
})

export function normalizeApiError(error, fallbackMessage = 'Something went wrong.') {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return {
        code: 'network_error',
        message:
          'Unable to reach the server. Check your connection and try again.',
        fields: {},
        status: 0,
      }
    }

    const payload = error.response.data?.error
    if (payload && typeof payload === 'object') {
      return {
        code: payload.code || 'api_error',
        message: payload.message || fallbackMessage,
        fields: payload.fields || {},
        status: error.response.status,
      }
    }

    return {
      code: 'api_error',
      message: fallbackMessage,
      fields: {},
      status: error.response.status,
    }
  }

  return {
    code: 'unexpected_error',
    message: error?.message || fallbackMessage,
    fields: {},
    status: null,
  }
}

export function firstFieldError(fields, name) {
  const value = fields?.[name]
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return String(value)
}

export function isCanceled(error) {
  return axios.isCancel(error) || error?.code === 'ERR_CANCELED'
}
