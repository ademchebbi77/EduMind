import { api } from '../lib/api'

/**
 * Sessions en ligne
 */
export async function fetchSessions(
  { search = '', type = '', status = '', ordering = 'starts_at', page = 1 } = {},
  { signal } = {},
) {
  const params = { page }
  if (search)   params.search   = search
  if (type)     params.type     = type
  if (status)   params.status   = status
  if (ordering) params.ordering = ordering
  const { data } = await api.get('/sessions/', { params, signal })
  return data
}

/**
 * Recommandations personnalisées (étudiants uniquement) — renvoie un tableau
 * de sessions triées, chacune avec `match_score` et `recommendation_reason`.
 */
export async function fetchRecommendedSessions({ limit = 6 } = {}, { signal } = {}) {
  const { data } = await api.get('/sessions/recommended/', { params: { limit }, signal })
  return data
}

export async function fetchSession(id, { signal } = {}) {
  const { data } = await api.get(`/sessions/${id}/`, { signal })
  return data
}

export async function createSession(payload) {
  const { data } = await api.post('/sessions/', payload)
  return data
}

export async function updateSession(id, payload) {
  const { data } = await api.patch(`/sessions/${id}/`, payload)
  return data
}

export async function deleteSession(id) {
  await api.delete(`/sessions/${id}/`)
}

export async function updateSessionStatus(id, status) {
  const { data } = await api.patch(`/sessions/${id}/status/`, { status })
  return data
}

export async function fetchSessionEnrollments(sessionId) {
  const { data } = await api.get(`/sessions/${sessionId}/enrollments/`)
  return data
}

/**
 * Calendrier — retourne toutes les sessions d'une plage sans pagination
 */
export async function fetchCalendarSessions(
  { startsAfter, startsBefore } = {},
  { signal } = {},
) {
  const params = {}
  if (startsAfter)  params.starts_after  = startsAfter
  if (startsBefore) params.starts_before = startsBefore
  const { data } = await api.get('/sessions/calendar/', { params, signal })
  return data
}

/**
 * Inscriptions
 */
export async function fetchEnrollments(
  { sessionId } = {},
  { signal } = {},
) {
  const params = {}
  if (sessionId) params.session = sessionId
  const { data } = await api.get('/enrollments/', { params, signal })
  return data
}

export async function enrollInSession(sessionId, message = '') {
  const { data } = await api.post('/enrollments/', { session: sessionId, message })
  return data
}

export async function updateEnrollmentStatus(enrollmentId, status) {
  const { data } = await api.patch(`/enrollments/${enrollmentId}/`, { status })
  return data
}

export async function cancelEnrollment(enrollmentId) {
  await api.delete(`/enrollments/${enrollmentId}/`)
}
