import { describe, expect, it } from 'vitest'
import {
  apiQuizErrors,
  buildQuizPayload,
  canManageAssessment,
  changeQuestionType,
  emptyQuestion,
  formatCountdown,
  manageableCourses,
  validateExercise,
  validateQuizDraft,
} from './assessments'

const VALUES = {
  title: 'Quiz',
  description: '',
  course: '3',
  difficulty: 'beginner',
  duration_minutes: '',
  passing_score: '50',
  max_attempts: '',
  reveal_answers: true,
  is_published: false,
}

function validQuestion(overrides = {}) {
  const question = emptyQuestion()
  question.text = 'What is 2 + 2?'
  question.options[0].text = '4'
  question.options[0].is_correct = true
  question.options[1].text = '5'
  return { ...question, ...overrides }
}

describe('validateQuizDraft', () => {
  it('accepts a valid quiz', () => {
    const result = validateQuizDraft(VALUES, [validQuestion()])
    expect(result.errors).toEqual({})
    expect(result.questionErrors).toEqual({})
  })

  it('requires a title, a course, valid numbers and at least one question', () => {
    const { errors } = validateQuizDraft(
      { ...VALUES, title: ' ', course: '', passing_score: '120', duration_minutes: '0', max_attempts: '-1' },
      [],
    )
    expect(Object.keys(errors).sort()).toEqual(
      ['course', 'duration_minutes', 'max_attempts', 'passing_score', 'questions', 'title'].sort(),
    )
  })

  it('reports question problems', () => {
    const noCorrect = validQuestion()
    noCorrect.options = noCorrect.options.map((option) => ({ ...option, is_correct: false }))
    const twoCorrect = validQuestion()
    twoCorrect.options = twoCorrect.options.map((option) => ({ ...option, is_correct: true }))
    const duplicate = validQuestion()
    duplicate.options[1].text = '4'
    const emptyText = validQuestion({ text: '' , points: '0' })

    const { questionErrors } = validateQuizDraft(VALUES, [noCorrect, twoCorrect, duplicate, emptyText])

    expect(questionErrors[noCorrect.key].options).toMatch(/at least one/i)
    expect(questionErrors[twoCorrect.key].options).toMatch(/exactly one/i)
    expect(questionErrors[duplicate.key].options).toMatch(/different/i)
    expect(questionErrors[emptyText.key]).toMatchObject({ text: expect.any(String), points: expect.any(String) })
  })

  it('allows several correct options for multiple choice', () => {
    const question = changeQuestionType(validQuestion(), 'multiple_choice')
    question.options = question.options.map((option) => ({ ...option, is_correct: true }))
    expect(validateQuizDraft(VALUES, [question]).questionErrors).toEqual({})
  })
})

describe('changeQuestionType', () => {
  it('builds true/false options and keeps one correct option for single choice', () => {
    const trueFalse = changeQuestionType(validQuestion(), 'true_false')
    expect(trueFalse.options.map((option) => option.text)).toEqual(['True', 'False'])

    const multiple = changeQuestionType(validQuestion(), 'multiple_choice')
    multiple.options = multiple.options.map((option) => ({ ...option, is_correct: true }))
    const single = changeQuestionType(multiple, 'single_choice')
    expect(single.options.filter((option) => option.is_correct)).toHaveLength(1)
  })
})

describe('buildQuizPayload', () => {
  it('converts the draft and keeps existing ids only', () => {
    const existing = { ...validQuestion(), id: 11 }
    existing.options[0].id = 21
    const payload = buildQuizPayload(
      { ...VALUES, duration_minutes: '15', title: '  Quiz  ' },
      [existing, validQuestion()],
    )

    expect(payload).toMatchObject({ course: 3, title: 'Quiz', duration_minutes: 15, max_attempts: null })
    expect(payload.questions[0].id).toBe(11)
    expect(payload.questions[0].options[0]).toEqual({ id: 21, text: '4', is_correct: true })
    expect(payload.questions[1]).not.toHaveProperty('id')
    expect(payload.questions[1].options[0]).not.toHaveProperty('key')
  })
})

describe('apiQuizErrors', () => {
  it('maps per-question errors keyed by index', () => {
    const questions = [validQuestion(), validQuestion()]
    const { errors, questionErrors } = apiQuizErrors(
      { title: ['Required.'], questions: { 1: { options: ['Add at least two answer options.'] } } },
      questions,
    )
    expect(errors.title).toBe('Required.')
    expect(errors.questions).toMatch(/review/i)
    expect(questionErrors[questions[1].key].options).toBe('Add at least two answer options.')
  })

  it('keeps a plain questions message', () => {
    expect(apiQuizErrors({ questions: ['Add at least one question.'] }).errors.questions).toBe(
      'Add at least one question.',
    )
  })
})

describe('permissions', () => {
  const teacher = { id: 7, role: 'teacher' }
  it('lets owners and admins manage', () => {
    expect(canManageAssessment(teacher, { course_owner: 7 })).toBe(true)
    expect(canManageAssessment(teacher, { course_owner: 8 })).toBe(false)
    expect(canManageAssessment({ id: 1, role: 'admin' }, { course_owner: 8 })).toBe(true)
    expect(canManageAssessment({ id: 7, role: 'student' }, { course_owner: 7 })).toBe(false)
  })

  it('limits course choices to owned courses for teachers', () => {
    const courses = [{ id: 1, owner: 7 }, { id: 2, owner: 8 }]
    expect(manageableCourses(teacher, courses).map((course) => course.id)).toEqual([1])
    expect(manageableCourses({ id: 1, role: 'admin' }, courses)).toHaveLength(2)
    expect(manageableCourses({ id: 9, role: 'student' }, courses)).toEqual([])
  })
})

describe('validateExercise', () => {
  const values = {
    title: 'Essay',
    instructions: 'Write.',
    course: '1',
    points: '10',
    due_at: '',
  }
  it('validates required fields and points', () => {
    expect(validateExercise(values)).toEqual({})
    expect(Object.keys(validateExercise({ ...values, title: '', instructions: ' ', course: '', points: '0' })).sort())
      .toEqual(['course', 'instructions', 'points', 'title'])
    expect(validateExercise({ ...values, due_at: '2000-01-01T10:00' }).due_at).toMatch(/future/)
    expect(validateExercise({ ...values, due_at: '2000-01-01T10:00' }, { isEdit: true })).toEqual({})
  })
})

describe('formatCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(125.4)).toBe('02:05')
    expect(formatCountdown(-3)).toBe('00:00')
  })
})
