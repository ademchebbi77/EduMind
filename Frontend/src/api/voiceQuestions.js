import { api } from '../lib/api'

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
  const { data } = await api.post('/voice-questions/', formData, { onUploadProgress })
  return data
}

export async function askVoiceQuestion(questionId, questionText) {
  const { data } = await api.post(`/voice-questions/${questionId}/ask/`, {
    question_text: questionText,
  })
  return data
}

export async function retryVoiceQuestion(questionId) {
  const { data } = await api.post(`/voice-questions/${questionId}/retry/`)
  return data
}

export async function deleteVoiceQuestion(questionId) {
  await api.delete(`/voice-questions/${questionId}/`)
}
