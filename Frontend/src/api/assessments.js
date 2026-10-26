import { api } from '../lib/api'

function listParams({ search = '', course = '', difficulty = '', ordering = '-created_at', page = 1 }) {
  const params = { page }
  if (search) params.search = search
  if (course) params.course = course
  if (difficulty) params.difficulty = difficulty
  if (ordering) params.ordering = ordering
  return params
}

// --- Quizzes ---------------------------------------------------------------

export async function fetchQuizzes(filters = {}, { signal } = {}) {
  const { data } = await api.get('/quizzes/', { params: listParams(filters), signal })
  return data
}

export async function fetchQuiz(quizId, { signal } = {}) {
  const { data } = await api.get(`/quizzes/${quizId}/`, { signal })
  return data
}

export async function createQuiz(payload) {
  const { data } = await api.post('/quizzes/', payload)
  return data
}

export async function updateQuiz(quizId, payload) {
  const { data } = await api.put(`/quizzes/${quizId}/`, payload)
  return data
}

export async function deleteQuiz(quizId) {
  await api.delete(`/quizzes/${quizId}/`)
}

export async function startQuizAttempt(quizId) {
  const { data } = await api.post(`/quizzes/${quizId}/start/`)
  return data
}

export async function submitQuizAttempt(quizId, answers) {
  const { data } = await api.post(`/quizzes/${quizId}/submit/`, { answers })
  return data
}

export async function fetchQuizAttempts(quizId, { page = 1 } = {}, { signal } = {}) {
  const { data } = await api.get(`/quizzes/${quizId}/attempts/`, { params: { page }, signal })
  return data
}

export async function fetchQuizAttempt(quizId, attemptId, { signal } = {}) {
  const { data } = await api.get(`/quizzes/${quizId}/attempts/${attemptId}/`, { signal })
  return data
}

// --- Exercises -------------------------------------------------------------

export async function fetchExercises(filters = {}, { signal } = {}) {
  const { data } = await api.get('/exercises/', { params: listParams(filters), signal })
  return data
}

export async function fetchExercise(exerciseId, { signal } = {}) {
  const { data } = await api.get(`/exercises/${exerciseId}/`, { signal })
  return data
}

/** ``formData`` is a FormData so an attachment can be uploaded with the fields. */
export async function createExercise(formData, { onUploadProgress } = {}) {
  const { data } = await api.post('/exercises/', formData, { onUploadProgress })
  return data
}

export async function updateExercise(exerciseId, formData, { onUploadProgress } = {}) {
  const { data } = await api.patch(`/exercises/${exerciseId}/`, formData, { onUploadProgress })
  return data
}

export async function deleteExercise(exerciseId) {
  await api.delete(`/exercises/${exerciseId}/`)
}

export async function submitExerciseAnswer(exerciseId, content) {
  const { data } = await api.put(`/exercises/${exerciseId}/submission/`, { content })
  return data
}

export async function fetchExerciseSubmissions(exerciseId, { page = 1 } = {}, { signal } = {}) {
  const { data } = await api.get(`/exercises/${exerciseId}/submissions/`, {
    params: { page },
    signal,
  })
  return data
}

export async function gradeExerciseSubmission(exerciseId, submissionId, payload) {
  const { data } = await api.patch(
    `/exercises/${exerciseId}/submissions/${submissionId}/`,
    payload,
  )
  return data
}

// --- Local quiz generator ----------------------------------------------------

/** ``formData`` holds either ``course`` or ``file``, plus the generation options. */
export async function startQuizGeneration(formData, { onUploadProgress } = {}) {
  const { data } = await api.post('/quiz-generator/jobs/', formData, { onUploadProgress })
  return data
}

export async function fetchQuizGeneration(jobId, { signal } = {}) {
  const { data } = await api.get(`/quiz-generator/jobs/${jobId}/`, { signal })
  return data
}

export async function fetchGenerationSources({ signal } = {}) {
  const { data } = await api.get('/quiz-generator/sources/', { signal })
  return data.results
}

export async function fetchGenerationMetrics({ signal } = {}) {
  const { data } = await api.get('/quiz-generator/metrics/', { signal })
  return data
}

// --- Courses ---------------------------------------------------------------

const COURSE_PAGE_SIZE = 50

/** Every course, across pages, for course selectors and filters. */
export async function fetchCourseOptions({ signal } = {}) {
  const courses = []
  let page = 1
  for (;;) {
    const { data } = await api.get('/courses/', {
      params: { page, page_size: COURSE_PAGE_SIZE, ordering: 'title' },
      signal,
    })
    courses.push(...data.results)
    if (!data.next) return courses
    page += 1
  }
}
