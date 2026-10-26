import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { draftFromGeneration } from '../../lib/assessments'
import QuizFormPage from './QuizFormPage'
import QuizGeneratorPage from './QuizGeneratorPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  startQuizGeneration: vi.fn(),
  fetchQuizGeneration: vi.fn(),
  fetchGenerationSources: vi.fn(),
  fetchGenerationMetrics: vi.fn(),
  createQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  fetchQuiz: vi.fn(),
  fetchCourseOptions: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/assessments', () => mocks)
vi.mock('../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    config: { max_upload_size_mb: 50, max_upload_size_bytes: 50 * 1024 * 1024 },
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

const TEACHER = { id: 7, full_name: 'Thomas Teacher', role: 'teacher' }

const SOURCES = [
  { id: 1, title: 'Neural networks', type: 'pdf', available: true, reason: '' },
  { id: 2, title: 'Podcast', type: 'audio', available: false, reason: 'Transcript needed.' },
]

const METRICS = {
  jobs: 3,
  completed: 2,
  failed: 1,
  processing_ms: { median: 120, p95: 200, max: 200 },
  queue_ms: { median: 30, p95: 50 },
  questions: { requested: 20, generated: 20, fill_rate: 1, valid_rate: 1, grounded_rate: 1 },
  teacher_review: { quizzes: 1, questions: 10, acceptance_rate: 0.8, unchanged_rate: 0.6, edited_rate: 0.2 },
  engine: { fr: 'pure-python', en: 'pure-python' },
}

const QUESTIONS = [
  {
    text: 'Fill in the blank: The _____ controls the size of each update.',
    type: 'single_choice',
    points: 2,
    explanation: 'From the course: “The learning rate controls the size of each update.”',
    difficulty: 'intermediate',
    kind: 'cloze',
    source: 'The learning rate controls the size of each update.',
    options: [
      { text: 'learning rate', is_correct: true },
      { text: 'loss function', is_correct: false },
      { text: 'activation function', is_correct: false },
    ],
  },
  {
    text: 'True or false? Dropout disables neurons during training.',
    type: 'true_false',
    points: 1,
    explanation: 'True. The course states: “Dropout disables neurons during training.”',
    difficulty: 'beginner',
    kind: 'true_false',
    source: 'Dropout disables neurons during training.',
    options: [
      { text: 'True', is_correct: true },
      { text: 'False', is_correct: false },
    ],
  },
]

const QUEUED = {
  id: 'job-1',
  status: 'queued',
  stage: 'queued',
  progress: 0,
  source_name: 'Neural networks',
  course: 1,
  result: null,
}

const COMPLETED = {
  ...QUEUED,
  status: 'completed',
  stage: 'done',
  progress: 100,
  language: 'en',
  engine: 'pure-python',
  processing_ms: 140,
  result: {
    title: 'Quiz: Neural networks',
    description: 'Generated locally.',
    difficulty: 'intermediate',
    warnings: ['Only 2 good questions could be generated (requested 10).'],
    questions: QUESTIONS,
  },
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/quizzes/generate" element={<QuizGeneratorPage />} />
        <Route path="/quizzes/new" element={<QuizFormPage />} />
        <Route path="/quizzes/:quizId" element={<p>Quiz detail page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: TEACHER, status: 'authenticated' })
  mocks.fetchGenerationSources.mockResolvedValue(SOURCES)
  mocks.fetchGenerationMetrics.mockResolvedValue(METRICS)
  mocks.fetchCourseOptions.mockResolvedValue([{ id: 1, title: 'Neural networks', owner: 7 }])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('QuizGeneratorPage', () => {
  it('lists courses with their availability and shows generator statistics', async () => {
    renderRoute('/quizzes/generate')

    const select = await screen.findByLabelText(/^course/i)
    expect(within(select).getByRole('option', { name: 'Neural networks' })).toBeEnabled()
    expect(within(select).getByRole('option', { name: /podcast — transcript needed/i })).toBeDisabled()
    expect(screen.getByText('Generator statistics')).toBeInTheDocument()
    expect(screen.getByText('80 %')).toBeInTheDocument()
  })

  it('validates the form before starting', async () => {
    const user = userEvent.setup()
    renderRoute('/quizzes/generate')

    await user.click(await screen.findByRole('button', { name: /generate questions/i }))

    expect(screen.getByText('Select a course.')).toBeInTheDocument()
    expect(mocks.startQuizGeneration).not.toHaveBeenCalled()
  })

  it('starts a job, follows its progress and opens the result in the quiz builder', async () => {
    const user = userEvent.setup()
    mocks.startQuizGeneration.mockResolvedValue(QUEUED)
    mocks.fetchQuizGeneration
      .mockResolvedValueOnce({ ...QUEUED, status: 'processing', stage: 'analysing', progress: 45 })
      .mockResolvedValue(COMPLETED)
    renderRoute('/quizzes/generate')

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.clear(screen.getByLabelText(/number of questions/i))
    await user.type(screen.getByLabelText(/number of questions/i), '6')
    await user.click(screen.getByLabelText('Multiple choice'))
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    const formData = mocks.startQuizGeneration.mock.calls[0][0]
    expect(formData.get('course')).toBe('1')
    expect(formData.get('num_questions')).toBe('6')
    expect(formData.getAll('question_types')).toEqual(['single_choice', 'true_false'])

    expect(await screen.findByText(/generating your quiz/i)).toBeInTheDocument()
    expect(await screen.findByText(/2 questions ready to review/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/only 2 good questions/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open in quiz builder/i }))

    expect(await screen.findByText(/2 questions generated locally/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/quiz title/i)).toHaveValue('Quiz: Neural networks')
    expect(screen.getAllByRole('group')).toHaveLength(2)
  })

  it('shows why a job failed and lets the teacher retry', async () => {
    const user = userEvent.setup()
    mocks.startQuizGeneration.mockResolvedValue({
      ...QUEUED,
      status: 'failed',
      stage: 'failed',
      error_message: 'No text could be extracted from this PDF. It may be a scanned document.',
    })
    renderRoute('/quizzes/generate')

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    expect(await screen.findByText(/scanned document/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate questions/i })).toBeEnabled()
  })

  it('reports a stopped worker after a while in the queue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.startQuizGeneration.mockResolvedValue(QUEUED)
    mocks.fetchQuizGeneration.mockResolvedValue(QUEUED)
    renderRoute('/quizzes/generate')

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.click(screen.getByRole('button', { name: /generate questions/i }))
    await screen.findByText(/generating your quiz/i)
    // Each poll is scheduled after the previous response, so advance step by step.
    for (let second = 0; second < 18; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
    }

    expect(await screen.findByText(/no background worker/i)).toBeInTheDocument()
  })

  it('shows server errors such as an unavailable worker', async () => {
    const user = userEvent.setup()
    mocks.startQuizGeneration.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 503,
        data: {
          error: {
            code: 'generator_unavailable',
            message: 'The background worker is unavailable. Start Redis and the Celery worker, then try again.',
          },
        },
      },
    })
    renderRoute('/quizzes/generate')

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    expect(await screen.findByText(/start redis and the celery worker/i)).toBeInTheDocument()
  })

  it('uploads a document instead of a course', async () => {
    const user = userEvent.setup({ applyAccept: false })
    mocks.startQuizGeneration.mockResolvedValue(COMPLETED)
    renderRoute('/quizzes/generate')

    await user.click(await screen.findByRole('radio', { name: /upload a document/i }))
    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['x'], 'virus.exe', { type: 'application/octet-stream' }),
    )
    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()

    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['Course notes'], 'notes.txt', { type: 'text/plain' }),
    )
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    // The quiz must belong to a course, even when the text comes from a file.
    expect(screen.getByText('Choose the course this quiz belongs to.')).toBeInTheDocument()
    expect(mocks.startQuizGeneration).not.toHaveBeenCalled()

    // Any owned course can host the quiz, even one without readable text.
    const target = screen.getByLabelText(/course for this quiz/i)
    expect(within(target).getByRole('option', { name: 'Podcast' })).toBeEnabled()
    await user.selectOptions(target, '2')
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    const formData = mocks.startQuizGeneration.mock.calls[0][0]
    expect(formData.get('file').name).toBe('notes.txt')
    expect(formData.get('course')).toBe('2')
    expect(formData.get('create_course')).toBeNull()
    // Only a PDF can become a course.
    expect(within(target).getByRole('option', { name: /create a new course/i })).toBeDisabled()
  })

  it('turns an uploaded PDF into a new course by default', async () => {
    const user = userEvent.setup()
    mocks.startQuizGeneration.mockResolvedValue({ ...COMPLETED, course: 5 })
    renderRoute('/quizzes/generate')

    await user.click(await screen.findByRole('radio', { name: /upload a document/i }))
    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['%PDF-1.4'], 'Chapitre 2 - Tests.pdf', { type: 'application/pdf' }),
    )

    expect(screen.getByLabelText(/course for this quiz/i)).toHaveValue('new')
    expect(screen.getByText(/published as a new course/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /generate questions/i }))

    const formData = mocks.startQuizGeneration.mock.calls[0][0]
    expect(formData.get('create_course')).toBe('true')
    expect(formData.get('course')).toBeNull()
    expect(await screen.findByText(/ready to review/i)).toBeInTheDocument()
    expect(mocks.fetchGenerationSources).toHaveBeenCalledTimes(2) // refreshed with the new course
  })
})

describe('QuizFormPage with a generated draft', () => {
  it('sends the reviewed questions with the generation job id', async () => {
    const user = userEvent.setup()
    mocks.createQuiz.mockResolvedValue({ id: 99, title: 'Quiz: Neural networks' })
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/quizzes/new', state: { generation: draftFromGeneration(COMPLETED) } },
        ]}
      >
        <Routes>
          <Route path="/quizzes/new" element={<QuizFormPage />} />
          <Route path="/quizzes/:quizId" element={<p>Quiz detail page</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/^course/i)).toHaveValue('1')
    const groups = screen.getAllByRole('group')
    await user.click(within(groups[1]).getByRole('button', { name: /remove question 2/i }))
    await user.click(screen.getByRole('button', { name: 'Create quiz' }))

    await waitFor(() => expect(mocks.createQuiz).toHaveBeenCalled())
    const payload = mocks.createQuiz.mock.calls[0][0]
    expect(payload.generation_job).toBe('job-1')
    expect(payload.questions).toHaveLength(1)
    expect(payload.questions[0]).not.toHaveProperty('id')
    expect(payload.questions[0].options[0]).toEqual({ text: 'learning rate', is_correct: true })
    expect(await screen.findByText('Quiz detail page')).toBeInTheDocument()
  })

  it('asks for a course and focuses it when an uploaded document has none', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/quizzes/new',
            state: { generation: draftFromGeneration({ ...COMPLETED, course: null }) },
          },
        ]}
      >
        <Routes>
          <Route path="/quizzes/new" element={<QuizFormPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/choose the course this quiz belongs to/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create quiz' }))

    expect(await screen.findByText('Select the course this quiz belongs to.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/^course/i)).toHaveFocus())
    expect(mocks.createQuiz).not.toHaveBeenCalled()
  })

  it('offers the generator from an empty quiz form', async () => {
    renderRoute('/quizzes/new')

    expect(
      await screen.findByRole('link', { name: /generate questions from a course document/i }),
    ).toHaveAttribute('href', '/quizzes/generate')
  })
})
