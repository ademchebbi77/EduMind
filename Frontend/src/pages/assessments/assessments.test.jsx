import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import AssessmentsPage from './AssessmentsPage'
import QuizFormPage from './QuizFormPage'
import QuizResultPage from './QuizResultPage'
import QuizTakePage from './QuizTakePage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchQuizzes: vi.fn(),
  fetchExercises: vi.fn(),
  fetchQuiz: vi.fn(),
  createQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  deleteExercise: vi.fn(),
  startQuizAttempt: vi.fn(),
  submitQuizAttempt: vi.fn(),
  fetchQuizAttempt: vi.fn(),
  fetchCourseOptions: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/assessments', () => mocks)

const TEACHER = { id: 7, full_name: 'Thomas Teacher', role: 'teacher' }
const STUDENT = { id: 9, full_name: 'Sofia Student', role: 'student' }

const COURSES = [
  { id: 1, title: 'My course', owner: 7 },
  { id: 2, title: "Colleague's course", owner: 8 },
]

const QUIZ = {
  id: 5,
  course: 1,
  course_title: 'My course',
  course_owner: 7,
  title: 'Basics quiz',
  description: 'Warm-up',
  difficulty: 'beginner',
  difficulty_display: 'Beginner',
  duration_minutes: null,
  passing_score: 50,
  max_attempts: null,
  reveal_answers: true,
  is_published: true,
  question_count: 2,
  total_points: 3,
  my_attempt_count: 0,
  my_best_percentage: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
}

const PUBLIC_QUESTIONS = [
  {
    id: 11,
    text: 'Capital of France?',
    type: 'single_choice',
    type_display: 'Single choice',
    points: 1,
    options: [
      { id: 101, text: 'Paris' },
      { id: 102, text: 'Lyon' },
    ],
  },
  {
    id: 12,
    text: 'Pick even numbers',
    type: 'multiple_choice',
    type_display: 'Multiple choice',
    points: 2,
    options: [
      { id: 201, text: '2' },
      { id: 202, text: '3' },
      { id: 203, text: '4' },
    ],
  },
]

function page(results) {
  return { count: results.length, next: null, previous: null, results }
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/assessments" element={<AssessmentsPage />} />
        <Route path="/quizzes/new" element={<QuizFormPage />} />
        <Route path="/quizzes/:quizId" element={<p>Quiz detail page</p>} />
        <Route path="/quizzes/:quizId/take" element={<QuizTakePage />} />
        <Route path="/quizzes/:quizId/attempts/:attemptId" element={<QuizResultPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function signInAs(user) {
  useAuth.mockReturnValue({ user, status: 'authenticated' })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  signInAs(TEACHER)
  mocks.fetchCourseOptions.mockResolvedValue(COURSES)
  mocks.fetchQuizzes.mockResolvedValue(page([QUIZ]))
  mocks.fetchExercises.mockResolvedValue(
    page([
      {
        id: 3,
        course: 2,
        course_title: "Colleague's course",
        course_owner: 8,
        title: 'Essay',
        description: '',
        difficulty: 'advanced',
        difficulty_display: 'Advanced',
        points: 20,
        due_at: null,
        is_published: true,
        submission_count: 0,
        graded_count: 0,
        my_submission_status: 'none',
        my_score: null,
      },
    ]),
  )
})

describe('AssessmentsPage', () => {
  it('lists quizzes, switches to exercises and shows management actions by ownership', async () => {
    const user = userEvent.setup()
    renderRoute('/assessments')

    expect(await screen.findByRole('link', { name: 'Basics quiz' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /edit “basics quiz”/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: "Colleague's course" })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /exercises/i }))
    expect(await screen.findByRole('link', { name: 'Essay' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete “essay”/i })).not.toBeInTheDocument()
  })

  it('sends filters to the API', async () => {
    const user = userEvent.setup()
    renderRoute('/assessments')
    await screen.findByRole('link', { name: 'Basics quiz' })

    await user.selectOptions(screen.getByLabelText('Difficulty'), 'advanced')
    await user.selectOptions(screen.getByLabelText('Course'), '1')

    await waitFor(() =>
      expect(mocks.fetchQuizzes).toHaveBeenLastCalledWith(
        expect.objectContaining({ difficulty: 'advanced', course: '1', page: 1 }),
        expect.anything(),
      ),
    )
  })

  it('confirms before deleting a quiz', async () => {
    const user = userEvent.setup()
    mocks.deleteQuiz.mockResolvedValue()
    renderRoute('/assessments')

    await user.click(await screen.findByRole('button', { name: /delete “basics quiz”/i }))
    const dialog = screen.getByRole('dialog', { name: /delete this quiz/i })
    await user.click(within(dialog).getByRole('button', { name: /delete permanently/i }))

    await waitFor(() => expect(mocks.deleteQuiz).toHaveBeenCalledWith(5))
    expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })

  it('hides creation buttons for students', async () => {
    signInAs(STUDENT)
    renderRoute('/assessments')

    await screen.findByRole('link', { name: 'Basics quiz' })
    expect(screen.queryByRole('link', { name: /new quiz/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /edit “basics quiz”/i })).not.toBeInTheDocument()
  })
})

describe('QuizFormPage', () => {
  it('only offers courses the teacher owns and blocks invalid quizzes', async () => {
    const user = userEvent.setup()
    renderRoute('/quizzes/new')

    const course = await screen.findByLabelText(/^course/i)
    expect(within(course).queryByRole('option', { name: "Colleague's course" })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create quiz' }))

    expect(await screen.findByText('Enter the quiz title.')).toBeInTheDocument()
    expect(screen.getByText('Enter the question text.')).toBeInTheDocument()
    expect(mocks.createQuiz).not.toHaveBeenCalled()
  })

  it('builds questions and submits them', async () => {
    const user = userEvent.setup()
    mocks.createQuiz.mockResolvedValue({ id: 42, title: 'New quiz' })
    renderRoute('/quizzes/new')

    await user.type(await screen.findByLabelText(/quiz title/i), 'New quiz')
    await user.selectOptions(screen.getByLabelText(/^course/i), '1')
    const question = screen.getAllByRole('group')[0]
    await user.type(within(question).getAllByRole('textbox')[0], 'Is water wet?')
    await user.selectOptions(within(question).getByLabelText('Question type'), 'true_false')
    await user.click(within(question).getByLabelText('Mark option 2 as correct'))
    await user.click(screen.getByRole('button', { name: 'Create quiz' }))

    await waitFor(() => expect(mocks.createQuiz).toHaveBeenCalled())
    const payload = mocks.createQuiz.mock.calls[0][0]
    expect(payload).toMatchObject({ course: 1, title: 'New quiz' })
    expect(payload.questions[0]).toMatchObject({
      text: 'Is water wet?',
      type: 'true_false',
      options: [
        { text: 'True', is_correct: false },
        { text: 'False', is_correct: true },
      ],
    })
    expect(await screen.findByText('Quiz detail page')).toBeInTheDocument()
  })

  it('shows server errors on the matching question', async () => {
    const user = userEvent.setup()
    mocks.createQuiz.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'validation_error',
            message: 'The submitted data is invalid.',
            fields: { questions: { 0: { options: ['Each answer option must be different.'] } } },
          },
        },
      },
    })
    renderRoute('/quizzes/new')

    await user.type(await screen.findByLabelText(/quiz title/i), 'Quiz')
    await user.selectOptions(screen.getByLabelText(/^course/i), '1')
    const question = screen.getAllByRole('group')[0]
    await user.type(within(question).getAllByRole('textbox')[0], 'Q')
    await user.type(within(question).getByPlaceholderText('Option 1'), 'A')
    await user.type(within(question).getByPlaceholderText('Option 2'), 'B')
    await user.click(within(question).getByLabelText('Mark option 1 as correct'))
    await user.click(screen.getByRole('button', { name: 'Create quiz' }))

    expect(await screen.findByText('Each answer option must be different.')).toBeInTheDocument()
  })
})

describe('QuizTakePage', () => {
  beforeEach(() => {
    signInAs(STUDENT)
    mocks.startQuizAttempt.mockResolvedValue({
      attempt: { id: 77, status: 'in_progress', expires_at: null },
      server_time: new Date().toISOString(),
      quiz: { ...QUIZ, questions: PUBLIC_QUESTIONS },
    })
  })

  it('lets the student navigate, answer and submit only option ids', async () => {
    const user = userEvent.setup()
    mocks.submitQuizAttempt.mockResolvedValue({ id: 77, status: 'submitted' })
    mocks.fetchQuiz.mockResolvedValue({ ...QUIZ, my_attempt_count: 1 })
    mocks.fetchQuizAttempt.mockResolvedValue({
      id: 77,
      quiz_title: 'Basics quiz',
      student: 9,
      status: 'submitted',
      score: 3,
      max_score: 3,
      percentage: 100,
      passed: true,
      passing_score: 50,
      answers_revealed: true,
      answers: [],
    })
    renderRoute('/quizzes/5/take')

    await user.click(await screen.findByLabelText('Paris'))
    await user.click(screen.getByRole('button', { name: /^next/i }))
    await user.click(screen.getByLabelText('2'))
    await user.click(screen.getByLabelText('4'))
    await user.click(screen.getByRole('button', { name: /^submit$/i }))
    await user.click(screen.getByRole('button', { name: 'Submit now' }))

    await waitFor(() =>
      expect(mocks.submitQuizAttempt).toHaveBeenCalledWith(5, [
        { question: 11, selected_options: [101] },
        { question: 12, selected_options: [201, 203] },
      ]),
    )
    expect(await screen.findByText('100 %')).toBeInTheDocument()
  })

  it('warns about unanswered questions before submitting', async () => {
    const user = userEvent.setup()
    renderRoute('/quizzes/5/take')

    await user.click(await screen.findByRole('button', { name: /submit answers/i }))

    expect(screen.getByText(/2 questions still have no answer/i)).toBeInTheDocument()
  })

  it('explains why a quiz cannot be started', async () => {
    mocks.startQuizAttempt.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: { code: 'validation_error', message: 'You have used all the attempts allowed for this quiz.' } },
      },
    })
    renderRoute('/quizzes/5/take')

    expect(await screen.findByText(/used all the attempts/i)).toBeInTheDocument()
  })
})

describe('QuizResultPage', () => {
  it('shows the server score and the correction', async () => {
    signInAs(STUDENT)
    mocks.fetchQuiz.mockResolvedValue({ ...QUIZ, my_attempt_count: 1 })
    mocks.fetchQuizAttempt.mockResolvedValue({
      id: 77,
      quiz: 5,
      quiz_title: 'Basics quiz',
      student: 9,
      student_name: 'Sofia Student',
      status: 'submitted',
      score: 1,
      max_score: 3,
      percentage: 33.33,
      passed: false,
      passing_score: 50,
      submitted_at: '2026-10-25T10:00:00Z',
      answers_revealed: true,
      answers: [
        {
          question: 11,
          text: 'Capital of France?',
          points: 1,
          points_awarded: 1,
          is_correct: true,
          selected_options: [101],
          explanation: 'Paris is the capital.',
          options: [
            { id: 101, text: 'Paris', is_correct: true },
            { id: 102, text: 'Lyon', is_correct: false },
          ],
        },
      ],
    })
    renderRoute('/quizzes/5/attempts/77')

    expect(await screen.findByText('33.3 %')).toBeInTheDocument()
    expect(screen.getByText('Not passed')).toBeInTheDocument()
    expect(screen.getByText('Your answer · correct')).toBeInTheDocument()
    expect(screen.getByText('Paris is the capital.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /try again/i })).toBeInTheDocument()
  })
})
