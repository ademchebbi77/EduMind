import { api } from '../lib/api'

function listParams({ search = '', type = '', category = '', tags = '', ordering = '', page = 1, pageSize } = {}) {
  const params = { page }
  if (search) params.search = search
  if (type) params.type = type
  if (category) params.category = category
  if (tags) params.tags = tags
  if (ordering) params.ordering = ordering
  if (pageSize) params.page_size = pageSize
  return params
}

export async function fetchCourses(
  { search = '', type = '', category = '', tags = '', ordering = '-created_at', page = 1, pageSize } = {},
  { signal } = {},
) {
  const { data } = await api.get('/courses/', {
    params: listParams({ search, type, category, tags, ordering, page, pageSize }),
    signal,
  })
  return data
}

export async function fetchMyCourses(
  { search = '', type = '', category = '', tags = '', ordering = '-created_at', page = 1, pageSize } = {},
  { signal } = {},
) {
  const { data } = await api.get('/courses/my-courses/', {
    params: listParams({ search, type, category, tags, ordering, page, pageSize }),
    signal,
  })
  return data
}

export async function fetchRecommendations({ limit = 5 } = {}, { signal } = {}) {
  const { data } = await api.get('/courses/ml-recommendations/', {
    params: { limit },
    signal,
  })
  return data
}

export async function fetchCourse(courseId, { signal } = {}) {
  const { data } = await api.get(`/courses/${courseId}/`, { signal })
  return data
}

export async function analyzeCourseContent(
  { file, courseId } = {},
  { onUploadProgress } = {},
) {
  const formData = new FormData()
  if (file) formData.append('file', file)
  if (courseId) formData.append('course_id', String(courseId))

  const { data } = await api.post('/courses/analyze-content/', formData, {
    onUploadProgress,
    timeout: 0,
  })
  return data
}

export async function createCourse(formData, { onUploadProgress } = {}) {
  const { data } = await api.post('/courses/', formData, {
    onUploadProgress,
    timeout: 0,
  })
  return data
}

export async function updateCourse(courseId, formData, { onUploadProgress } = {}) {
  const { data } = await api.patch(`/courses/${courseId}/`, formData, {
    onUploadProgress,
    timeout: 0,
  })
  return data
}

export async function updateCourseFields(courseId, payload) {
  const { data } = await api.patch(`/courses/${courseId}/`, payload)
  return data
}

export async function deleteCourse(courseId) {
  await api.delete(`/courses/${courseId}/`)
}

export async function enrollInCourse(courseId) {
  const { data } = await api.post(`/courses/${courseId}/enroll/`)
  return data
}

export async function unenrollFromCourse(courseId) {
  await api.post(`/courses/${courseId}/unenroll/`)
}

export async function fetchCategories(
  { search = '', ordering = 'name', page = 1, pageSize } = {},
  { signal } = {},
) {
  const params = { page, ordering }
  if (search) params.search = search
  if (pageSize) params.page_size = pageSize

  const { data } = await api.get('/categories/', { params, signal })
  return data
}

export async function createCategory(payload) {
  const { data } = await api.post('/categories/', payload)
  return data
}

export async function updateCategory(categoryId, payload) {
  const { data } = await api.patch(`/categories/${categoryId}/`, payload)
  return data
}

export async function deleteCategory(categoryId) {
  await api.delete(`/categories/${categoryId}/`)
}

export async function fetchCourseEnrollments(
  { course = '', ordering = '-enrolled_at', page = 1, pageSize } = {},
  { signal } = {},
) {
  const params = { page, ordering }
  if (course) params.course = course
  if (pageSize) params.page_size = pageSize

  const { data } = await api.get('/course-enrollments/', { params, signal })
  return data
}

export async function fetchCourseProgress(courseId, { signal } = {}) {
  const { data } = await api.get(`/courses/${courseId}/progress/`, { signal })
  return data
}

export async function updateCourseProgress(courseId, payload, { signal } = {}) {
  const { data } = await api.post(`/courses/${courseId}/progress/`, payload, {
    signal,
  })
  return data
}

export async function deleteCourseEnrollment(enrollmentId) {
  await api.delete(`/course-enrollments/${enrollmentId}/`)
}

export async function fetchCourseTranscript(courseId, { signal } = {}) {
  const { data } = await api.get(`/courses/${courseId}/transcript/`, { signal })
  return data
}

export async function generateCourseTranscript(courseId, { language = 'en' } = {}) {
  const { data } = await api.post(`/courses/${courseId}/transcript/`, { language })
  return data
}
