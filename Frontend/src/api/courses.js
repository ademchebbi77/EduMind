import { api } from '../lib/api'

export async function fetchCourses(
  { search = '', type = '', ordering = '-created_at', page = 1 } = {},
  { signal } = {},
) {
  const params = { page }
  if (search) params.search = search
  if (type) params.type = type
  if (ordering) params.ordering = ordering

  const { data } = await api.get('/courses/', { params, signal })
  return data
}

export async function fetchCourse(courseId, { signal } = {}) {
  const { data } = await api.get(`/courses/${courseId}/`, { signal })
  return data
}

export async function createCourse(formData, { onUploadProgress } = {}) {
  const { data } = await api.post('/courses/', formData, { onUploadProgress })
  return data
}

export async function updateCourse(courseId, formData, { onUploadProgress } = {}) {
  const { data } = await api.patch(`/courses/${courseId}/`, formData, {
    onUploadProgress,
  })
  return data
}

export async function deleteCourse(courseId) {
  await api.delete(`/courses/${courseId}/`)
}
