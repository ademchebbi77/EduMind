import { api } from '../lib/api'

export async function fetchUsers(
  { search = '', role = '', isActive = '', ordering = '-date_joined', page = 1 } = {},
  { signal } = {},
) {
  const params = { ordering, page }
  if (search) params.search = search
  if (role) params.role = role
  if (isActive) params.is_active = isActive

  const { data } = await api.get('/auth/users/', { params, signal })
  return data
}

export async function fetchUser(userId, { signal } = {}) {
  const { data } = await api.get(`/auth/users/${userId}/`, { signal })
  return data
}

export async function updateUser(userId, payload) {
  const { data } = await api.patch(`/auth/users/${userId}/`, payload)
  return data
}

export async function deleteUser(userId) {
  await api.delete(`/auth/users/${userId}/`)
}

/**
 * Étudiants à risque, score calculé localement (enseignants et admins).
 */
export async function fetchAtRiskStudents({ level = '' } = {}, { signal } = {}) {
  const params = {}
  if (level) params.level = level
  const { data } = await api.get('/auth/at-risk/', { params, signal })
  return data
}
