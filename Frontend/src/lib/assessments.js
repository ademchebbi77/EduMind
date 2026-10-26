import { fileExtension } from './format'
import { canManageCourses } from './roles'

export const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const DIFFICULTY_BADGE_VARIANTS = {
  beginner: 'sage',
  intermediate: 'brand',
  advanced: 'clay',
}

export const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
]

export function difficultyLabel(value) {
  return DIFFICULTIES.find((item) => item.value === value)?.label || value || ''
}

export function questionTypeLabel(value) {
  return QUESTION_TYPES.find((item) => item.value === value)?.label || value || ''
}

/** Mirrors the backend rule: admins manage everything, teachers their own courses. */
export function canManageAssessment(user, item) {
  if (!user || !item) return false
  if (user.role === 'admin') return true
  return user.role === 'teacher' && item.course_owner === user.id
}

/** Courses the user may attach quizzes and exercises to. */
export function manageableCourses(user, courses) {
  if (!canManageCourses(user?.role)) return []
  if (user.role === 'admin') return courses
  return courses.filter((course) => course.owner === user.id)
}

export function formatDuration(minutes) {
  if (!minutes) return 'Untimed'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function formatPercentage(value) {
  if (value === null || value === undefined) return '—'
  const number = Number(value)
  return `${Number.isInteger(number) ? number : number.toFixed(1)} %`
}

// --- Quiz builder -------------------------------------------------------------

let nextKey = 1

function key() {
  nextKey += 1
  return `draft-${nextKey}`
}

export function trueFalseOptions(correct = 'True', existing = []) {
  return ['True', 'False'].map((text, index) => ({
    key: existing[index]?.key || key(),
    id: existing[index]?.id,
    text,
    is_correct: text === correct,
  }))
}

export function emptyOption(text = '') {
  return { key: key(), text, is_correct: false }
}

export function emptyQuestion(type = 'single_choice') {
  return {
    key: key(),
    text: '',
    type,
    points: 1,
    explanation: '',
    options: type === 'true_false' ? trueFalseOptions() : [emptyOption(), emptyOption()],
  }
}

/** Turn API questions into editable drafts with stable React keys. */
export function questionsToDrafts(questions = []) {
  return questions.map((question) => ({
    key: key(),
    id: question.id,
    text: question.text,
    type: question.type,
    points: question.points,
    explanation: question.explanation || '',
    options: question.options.map((option) => ({
      key: key(),
      id: option.id,
      text: option.text,
      is_correct: Boolean(option.is_correct),
    })),
  }))
}

/** Switch a question's type while keeping as much of the draft as possible. */
export function changeQuestionType(question, type) {
  if (type === question.type) return question
  if (type === 'true_false') {
    const current = question.type === 'true_false' ? question.options : []
    return { ...question, type, options: trueFalseOptions('True', current) }
  }
  let options =
    question.type === 'true_false'
      ? [emptyOption(), emptyOption()]
      : question.options.map((option) => ({ ...option }))
  if (type === 'single_choice') {
    // Keep only the first correct option.
    let found = false
    options = options.map((option) => {
      if (option.is_correct && !found) {
        found = true
        return option
      }
      return { ...option, is_correct: false }
    })
  }
  return { ...question, type, options }
}

function isPositiveInteger(value, { min = 1, max = Infinity } = {}) {
  const number = Number(value)
  return value !== '' && Number.isInteger(number) && number >= min && number <= max
}

export function validateQuizDraft(values, questions) {
  const errors = {}
  const questionErrors = {}

  if (!values.title.trim()) errors.title = 'Enter the quiz title.'
  else if (values.title.trim().length > 200) errors.title = 'The title cannot exceed 200 characters.'

  if (!values.course) errors.course = 'Select the course this quiz belongs to.'

  if (values.duration_minutes !== '' && !isPositiveInteger(values.duration_minutes, { max: 300 })) {
    errors.duration_minutes = 'Enter a duration between 1 and 300 minutes, or leave it empty.'
  }
  if (!isPositiveInteger(values.passing_score, { min: 0, max: 100 })) {
    errors.passing_score = 'Enter a passing score between 0 and 100.'
  }
  if (values.max_attempts !== '' && !isPositiveInteger(values.max_attempts, { max: 100 })) {
    errors.max_attempts = 'Enter a number between 1 and 100, or leave it empty.'
  }

  if (questions.length === 0) errors.questions = 'Add at least one question.'

  questions.forEach((question) => {
    const problems = {}
    if (!question.text.trim()) problems.text = 'Enter the question text.'
    if (!isPositiveInteger(question.points, { max: 100 })) {
      problems.points = 'Points must be a whole number between 1 and 100.'
    }

    const filled = question.options.filter((option) => option.text.trim())
    const correct = question.options.filter((option) => option.is_correct)
    const texts = filled.map((option) => option.text.trim().toLowerCase())

    if (question.options.some((option) => !option.text.trim())) {
      problems.options = 'Fill in every answer option or remove the empty ones.'
    } else if (question.type !== 'true_false' && question.options.length < 2) {
      problems.options = 'Add at least two answer options.'
    } else if (new Set(texts).size !== texts.length) {
      problems.options = 'Each answer option must be different.'
    } else if (correct.length === 0) {
      problems.options = 'Mark at least one option as correct.'
    } else if (question.type !== 'multiple_choice' && correct.length !== 1) {
      problems.options = 'Select exactly one correct option.'
    }

    if (Object.keys(problems).length) questionErrors[question.key] = problems
  })

  return { errors, questionErrors }
}

function optionalInteger(value) {
  return value === '' || value === null || value === undefined ? null : Number(value)
}

export function buildQuizPayload(values, questions) {
  return {
    course: Number(values.course),
    title: values.title.trim(),
    description: values.description.trim(),
    difficulty: values.difficulty,
    duration_minutes: optionalInteger(values.duration_minutes),
    passing_score: Number(values.passing_score),
    max_attempts: optionalInteger(values.max_attempts),
    reveal_answers: values.reveal_answers,
    is_published: values.is_published,
    questions: questions.map((question) => ({
      ...(question.id ? { id: question.id } : {}),
      text: question.text.trim(),
      type: question.type,
      points: Number(question.points),
      explanation: question.explanation.trim(),
      options: question.options.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        text: option.text.trim(),
        is_correct: option.is_correct,
      })),
    })),
  }
}

function firstMessage(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item) => typeof item === 'string')
  return undefined
}

function deepFirstMessage(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  for (const item of Object.values(value)) {
    const message = deepFirstMessage(item)
    if (message) return message
  }
  return undefined
}

/**
 * Map backend field errors to the form. ``questions`` is either a message or
 * one object per question (``{}`` when that question is valid).
 */
export function apiQuizErrors(fields = {}, questions = []) {
  const errors = {}
  const questionErrors = {}
  for (const name of [
    'title',
    'description',
    'course',
    'difficulty',
    'duration_minutes',
    'passing_score',
    'max_attempts',
  ]) {
    const message = firstMessage(fields[name])
    if (message) errors[name] = message
  }

  const questionFields = fields.questions
  // DRF reports per-item errors either as a list or as an object keyed by index.
  const perQuestion = Array.isArray(questionFields)
    ? questionFields.map((item, index) => [index, item])
    : questionFields && typeof questionFields === 'object'
      ? Object.entries(questionFields).filter(([index]) => /^\d+$/.test(index))
      : []
  if (perQuestion.some(([, item]) => item && typeof item === 'object' && !Array.isArray(item))) {
    perQuestion.forEach(([index, item]) => {
      const question = questions[Number(index)]
      if (!question || !item || typeof item !== 'object') return
      const problems = {}
      for (const name of ['text', 'points', 'type', 'explanation']) {
        const message = firstMessage(item[name])
        if (message) problems[name] = message
      }
      const optionMessage = deepFirstMessage(item.options)
      if (optionMessage) problems.options = optionMessage
      if (Object.keys(problems).length) questionErrors[question.key] = problems
    })
    if (Object.keys(questionErrors).length) {
      errors.questions = 'Some questions are invalid. Review them and try again.'
    }
  } else {
    const message = firstMessage(questionFields)
    if (message) errors.questions = message
  }

  return { errors, questionErrors }
}

// --- Exercises ---------------------------------------------------------------

export function validateExercise(values, { isEdit = false } = {}) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Enter the exercise title.'
  else if (values.title.trim().length > 200) errors.title = 'The title cannot exceed 200 characters.'
  if (!values.instructions.trim()) errors.instructions = 'Enter the instructions students must follow.'
  if (!values.course) errors.course = 'Select the course this exercise belongs to.'
  const points = Number(values.points)
  if (values.points === '' || !Number.isInteger(points) || points < 1 || points > 1000) {
    errors.points = 'Enter a whole number of points between 1 and 1000.'
  }
  if (values.due_at) {
    const due = new Date(values.due_at)
    if (Number.isNaN(due.getTime())) errors.due_at = 'Enter a valid date.'
    else if (!isEdit && due < new Date()) errors.due_at = 'The due date must be in the future.'
  }
  return errors
}

/** Client-side check of an exercise attachment against the server upload rules. */
export function validateAttachment(file, config) {
  if (!config) return 'Upload rules are not available yet.'
  const extension = fileExtension(file.name)
  const formats = config.allowed_extensions.map((value) => value.toUpperCase()).join(', ')
  if (!config.allowed_extensions.includes(extension)) {
    return `Unsupported format. Choose a file: ${formats}.`
  }
  if (file.size <= 0) return 'This file is empty.'
  if (file.size > config.max_upload_size_bytes) {
    return `The file exceeds the maximum size of ${config.max_upload_size_mb} MB.`
  }
  return null
}

export function attachmentKind(fileName, config) {
  return config?.pdf_extensions?.includes(fileExtension(fileName)) ? 'pdf' : 'audio'
}

export function buildExerciseFormData(values, { file = null, removeAttachment = false } = {}) {
  const formData = new FormData()
  formData.append('course', values.course)
  formData.append('title', values.title.trim())
  formData.append('description', values.description.trim())
  formData.append('instructions', values.instructions.trim())
  formData.append('difficulty', values.difficulty)
  formData.append('points', String(Number(values.points)))
  // An empty value clears the due date on the server.
  formData.append('due_at', values.due_at ? new Date(values.due_at).toISOString() : '')
  formData.append('is_published', values.is_published ? 'true' : 'false')
  if (file) formData.append('attachment', file)
  else if (removeAttachment) formData.append('remove_attachment', 'true')
  return formData
}

// --- Local quiz generator -------------------------------------------------------

export const GENERATION_STAGES = [
  { value: 'queued', label: 'Waiting for a worker' },
  { value: 'extracting', label: 'Reading the document' },
  { value: 'analysing', label: 'Finding key ideas' },
  { value: 'generating', label: 'Writing questions' },
  { value: 'done', label: 'Ready to review' },
]

export const GENERATION_FILE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md']

export function isGenerationFinished(job) {
  return job?.status === 'completed' || job?.status === 'failed'
}

/** Form values and question drafts for the quiz builder from a completed job. */
export function draftFromGeneration(job) {
  const result = job.result || {}
  return {
    jobId: job.id,
    sourceName: job.source_name,
    engine: job.engine,
    language: job.language,
    warnings: result.warnings || [],
    values: {
      title: (result.title || '').slice(0, 200),
      description: result.description || '',
      course: job.course ? String(job.course) : '',
      difficulty: result.difficulty || 'beginner',
    },
    questions: questionsToDrafts(result.questions || []),
  }
}
