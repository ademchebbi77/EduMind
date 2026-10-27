import { api } from '../lib/api'

// On a server without a background worker, the AI work runs during the request.
const AI_TIMEOUT = 180000

export async function fetchVoiceConfig({ signal } = {}) {
  const { data } = await api.get('/voice-questions/config/', { signal })
  return data
}

export async function fetchVoiceQuestions({ page = 1, course = '' } = {}, { signal } = {}) {
  const params = { page }
  if (course) params.course = course
  const { data } = await api.get('/voice-questions/', { params, signal })
  return data
}

export async function fetchVoiceQuestion(questionId, { signal } = {}) {
  const { data } = await api.get(`/voice-questions/${questionId}/`, { signal })
  return data
}

/** ``formData`` holds ``course``, ``language`` and the ``audio`` file. */
export async function createVoiceQuestion(formData, { onUploadProgress } = {}) {
  const { data } = await api.post('/voice-questions/', formData, {
    onUploadProgress,
    timeout: AI_TIMEOUT,
  })
  return data
}

export async function askVoiceQuestion(questionId, questionText) {
  const { data } = await api.post(
    `/voice-questions/${questionId}/ask/`,
    { question_text: questionText },
    { timeout: AI_TIMEOUT },
  )
  return data
}

export async function retryVoiceQuestion(questionId) {
  const { data } = await api.post(`/voice-questions/${questionId}/retry/`, null, {
    timeout: AI_TIMEOUT,
  })
  return data
}

export async function deleteVoiceQuestion(questionId) {
  await api.delete(`/voice-questions/${questionId}/`)
}

/** ``rating`` is "helpful" or "not_helpful"; a ``reason`` is required for the latter. */
export async function rateVoiceQuestion(questionId, { rating, reason = '', comment = '' }) {
  const { data } = await api.post(`/voice-questions/${questionId}/rate/`, { rating, reason, comment })
  return data
}

export async function escalateVoiceQuestion(questionId) {
  const { data } = await api.post(`/voice-questions/${questionId}/escalate/`)
  return data
}

// --- Teacher review of questions sent after an unhelpful AI answer ---------------

export async function fetchVoiceReviews({ status = '', page = 1 } = {}, { signal } = {}) {
  const params = { page }
  if (status) params.status = status
  const { data } = await api.get('/voice-questions/reviews/', { params, signal })
  return data
}

export async function answerVoiceReview(questionId, teacherAnswer) {
  const { data } = await api.post(`/voice-questions/reviews/${questionId}/answer/`, {
    teacher_answer: teacherAnswer,
  })
  return data
}
