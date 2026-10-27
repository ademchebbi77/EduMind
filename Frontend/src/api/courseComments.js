import { api } from '../lib/api'

export async function fetchCourseComments(courseId, { page = 1 } = {}, { signal } = {}) {
  const { data } = await api.get('/voice-questions/comments/', {
    params: { course: courseId, page },
    signal,
  })
  return data
}

export async function createCourseComment(courseId, text) {
  const { data } = await api.post('/voice-questions/comments/', { course: courseId, text })
  return data
}

export async function updateCourseComment(commentId, text) {
  const { data } = await api.patch(`/voice-questions/comments/${commentId}/`, { text })
  return data
}

export async function deleteCourseComment(commentId) {
  await api.delete(`/voice-questions/comments/${commentId}/`)
}

export async function replyToCourseComment(commentId, reply) {
  const { data } = await api.post(`/voice-questions/comments/${commentId}/reply/`, { reply })
  return data
}

export async function deleteCourseCommentReply(commentId) {
  const { data } = await api.delete(`/voice-questions/comments/${commentId}/reply/`)
  return data
}
