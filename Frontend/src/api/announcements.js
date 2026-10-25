import { api } from '../lib/api'

export async function fetchAnnouncements(
  { search = '', page = 1 } = {},
  { signal } = {},
) {
  const params = { page }
  if (search) params.search = search
  const { data } = await api.get('/announcements/', { params, signal })
  return data
}

export async function fetchAnnouncement(id, { signal } = {}) {
  const { data } = await api.get(`/announcements/${id}/`, { signal })
  return data
}

export async function createAnnouncement(payload) {
  const { data } = await api.post('/announcements/', payload)
  return data
}

export async function updateAnnouncement(id, payload) {
  const { data } = await api.patch(`/announcements/${id}/`, payload)
  return data
}

export async function deleteAnnouncement(id) {
  await api.delete(`/announcements/${id}/`)
}

/**
 * Inscriptions aux annonces
 */
export async function enrollInAnnouncement(announcementId, data) {
  const { data: res } = await api.post('/announcement-enrollments/', {
    announcement: announcementId,
    ...data,
  })
  return res
}

export async function fetchAnnouncementEnrollments(announcementId) {
  const { data } = await api.get(`/announcements/${announcementId}/enrollments/`)
  return data
}

export async function updateAnnouncementEnrollmentStatus(announcementId, enrollmentId, status) {
  const { data } = await api.patch(
    `/announcements/${announcementId}/enrollments/${enrollmentId}/status/`,
    { status }
  )
  return data
}
