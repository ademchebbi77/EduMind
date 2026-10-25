import { api } from '../lib/api'

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me/')
  return data
}

export async function loginRequest(credentials) {
  const { data } = await api.post('/auth/login/', credentials)
  return data
}

export async function registerRequest(payload) {
  const { data } = await api.post('/auth/register/', payload)
  return data
}

export async function updateProfileRequest(payload) {
  const { avatar, ...fields } = payload
  let body = fields

  if (avatar instanceof File) {
    body = new FormData()
    Object.entries(fields).forEach(([key, value]) => {
      body.append(key, value)
    })
    body.append('avatar', avatar)
  }

  const { data } = await api.patch('/auth/me/', body)
  return data
}

export async function changePasswordRequest(payload) {
  const { data } = await api.post('/auth/me/password/', payload)
  return data
}

export async function logoutRequest() {
  await api.post('/auth/logout/')
}

export async function fetchAppConfig() {
  const { data } = await api.get('/config/')
  return data
}
