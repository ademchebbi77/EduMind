import { api } from '../lib/api'

// AI calls can take up to a minute (Gemini, then the image service).
const AI_TIMEOUT = { timeout: 120000 }

function listParams({ search = '', course = '', page = 1 }) {
  const params = { page }
  if (search) params.search = search
  if (course) params.course = course
  return params
}

// --- Summaries (CRUD) -------------------------------------------------------

export async function fetchSummaries(filters = {}, { signal } = {}) {
  const { data } = await api.get('/summaries/', { params: listParams(filters), signal })
  return data
}

export async function fetchSummary(summaryId, { signal } = {}) {
  const { data } = await api.get(`/summaries/${summaryId}/`, { signal })
  return data
}

export async function createSummary(payload) {
  const { data } = await api.post('/summaries/', payload)
  return data
}

export async function updateSummary(summaryId, payload) {
  const { data } = await api.patch(`/summaries/${summaryId}/`, payload)
  return data
}

export async function deleteSummary(summaryId) {
  await api.delete(`/summaries/${summaryId}/`)
}

// --- Summaries (AI) ---------------------------------------------------------

/** Gemini reads the whole course and writes a summary with its key concepts. */
export async function generateSummary(courseId) {
  const { data } = await api.post('/summaries/generate/', { course: courseId }, AI_TIMEOUT)
  return data
}

/** Gemini writes a visual prompt, then the image service draws the picture. */
export async function generateIllustration(summaryId) {
  const { data } = await api.post(`/summaries/${summaryId}/illustration/`, null, AI_TIMEOUT)
  return data
}

export async function deleteIllustration(summaryId) {
  const { data } = await api.delete(`/summaries/${summaryId}/illustration/`)
  return data
}

export async function fetchChat(summaryId, { signal } = {}) {
  const { data } = await api.get(`/summaries/${summaryId}/chat/`, { signal })
  return data
}

export async function askCourseAssistant(summaryId, question) {
  const { data } = await api.post(`/summaries/${summaryId}/chat/`, { question }, AI_TIMEOUT)
  return data
}

export async function clearChat(summaryId) {
  await api.delete(`/summaries/${summaryId}/chat/`)
}

// --- Resources (CRUD) -------------------------------------------------------

export async function fetchResources(filters = {}, { signal } = {}) {
  const { data } = await api.get('/resources/', { params: listParams(filters), signal })
  return data
}

export async function fetchResource(resourceId, { signal } = {}) {
  const { data } = await api.get(`/resources/${resourceId}/`, { signal })
  return data
}

function resourceFormData(values, file) {
  const form = new FormData()
  form.append('course', values.course)
  form.append('title', values.title)
  form.append('description', values.description)
  form.append('kind', values.kind)
  form.append('url', values.kind === 'link' ? values.url : '')
  if (values.kind === 'file' && file) form.append('file', file)
  return form
}

export async function createResource(values, file) {
  const { data } = await api.post('/resources/', resourceFormData(values, file))
  return data
}

export async function updateResource(resourceId, values, file) {
  const { data } = await api.patch(`/resources/${resourceId}/`, resourceFormData(values, file))
  return data
}

export async function deleteResource(resourceId) {
  await api.delete(`/resources/${resourceId}/`)
}
