import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import ExerciseDetailPage from './ExerciseDetailPage'
import ExerciseFormPage from './ExerciseFormPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchExercise: vi.fn(),
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  submitExerciseAnswer: vi.fn(),
  fetchExerciseSubmissions: vi.fn(),
  gradeExerciseSubmission: vi.fn(),
  fetchCourseOptions: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/assessments', () => mocks)
vi.mock('../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    config: {
      max_upload_size_mb: 50,
      max_upload_size_bytes: 50 * 1024 * 1024,
      allowed_extensions: ['pdf', 'mp3', 'wav', 'm4a', 'ogg'],
      pdf_extensions: ['pdf'],
      audio_extensions: ['mp3', 'wav', 'm4a', 'ogg'],
    },
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

const TEACHER = { id: 7, full_name: 'Thomas Teacher', role: 'teacher' }
const STUDENT = { id: 9, full_name: 'Sofia Student', role: 'student' }

const EXERCISE = {
  id: 3,
  course: 1,
  course_title: 'My course',
  course_owner: 7,
  title: 'Worksheet',
  description: '',
  instructions: 'Complete the worksheet.',
  difficulty: 'beginner',
  difficulty_display: 'Beginner',
  points: 10,
  due_at: null,
  is_published: true,
  attachment_name: 'worksheet.pdf',
  attachment_type: 'pdf',
  attachment_url: '/api/exercises/3/attachment/',
  attachment_download_url: '/api/exercises/3/attachment/download/',
  submission_count: 0,
  graded_count: 0,
  my_submission_status: 'none',
  my_submission: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/exercises/new" element={<ExerciseFormPage />} />
        <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
        <Route path="/exercises/:exerciseId/edit" element={<ExerciseFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function pdfFile(name = 'worksheet.pdf') {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

async function fillRequiredFields(user) {
  await user.type(await screen.findByLabelText(/exercise title/i), 'Worksheet')
  await user.type(screen.getByLabelText(/instructions/i), 'Complete it.')
  await user.selectOptions(screen.getByLabelText(/^course/i), '1')
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: TEACHER, status: 'authenticated' })
  mocks.fetchCourseOptions.mockResolvedValue([{ id: 1, title: 'My course', owner: 7 }])
  mocks.fetchExerciseSubmissions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
  mocks.fetchExercise.mockResolvedValue(EXERCISE)
})

describe('ExerciseFormPage attachment', () => {
  it('uploads the selected file with the exercise fields', async () => {
    const user = userEvent.setup()
    mocks.createExercise.mockResolvedValue({ ...EXERCISE, id: 10 })
    renderRoute('/exercises/new')

    await fillRequiredFields(user)
    await user.upload(screen.getByLabelText(/browse your files/i), pdfFile())
    expect(screen.getByText('worksheet.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create exercise' }))

    await waitFor(() => expect(mocks.createExercise).toHaveBeenCalled())
    const formData = mocks.createExercise.mock.calls[0][0]
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('attachment').name).toBe('worksheet.pdf')
    expect(formData.get('title')).toBe('Worksheet')
    expect(formData.get('due_at')).toBe('')
    expect(formData.get('remove_attachment')).toBeNull()
  })

  it('rejects unsupported files before upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderRoute('/exercises/new')

    await screen.findByLabelText(/exercise title/i)
    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    )

    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()
  })

  it('removes the current attachment on edit', async () => {
    const user = userEvent.setup()
    mocks.fetchExercise.mockResolvedValue(EXERCISE)
    mocks.updateExercise.mockResolvedValue(EXERCISE)
    renderRoute('/exercises/3/edit')

    await user.click(await screen.findByRole('button', { name: /remove file “worksheet.pdf”/i }))
    expect(screen.getByText(/will be removed when you save/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocks.updateExercise).toHaveBeenCalled())
    const formData = mocks.updateExercise.mock.calls[0][1]
    expect(formData.get('remove_attachment')).toBe('true')
    expect(formData.get('attachment')).toBeNull()
  })

  it('shows server-side file errors', async () => {
    const user = userEvent.setup()
    mocks.createExercise.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'validation_error',
            message: 'The submitted data is invalid.',
            fields: { attachment: ['The file content does not match its extension.'] },
          },
        },
      },
    })
    renderRoute('/exercises/new')

    await fillRequiredFields(user)
    await user.upload(screen.getByLabelText(/browse your files/i), pdfFile())
    await user.click(screen.getByRole('button', { name: 'Create exercise' }))

    expect(await screen.findByText(/does not match its extension/i)).toBeInTheDocument()
  })
})

describe('ExerciseDetailPage attachment', () => {
  it('shows the attachment to students with download link', async () => {
    useAuth.mockReturnValue({ user: STUDENT, status: 'authenticated' })
    mocks.fetchExercise.mockResolvedValue(EXERCISE)
    renderRoute('/exercises/3')

    expect(await screen.findByText('Supporting material')).toBeInTheDocument()
    expect(screen.getByTitle('PDF preview: worksheet.pdf')).toHaveAttribute(
      'src',
      '/api/exercises/3/attachment/',
    )
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
      'href',
      '/api/exercises/3/attachment/download/',
    )
  })

  it('hides the section when there is no attachment', async () => {
    mocks.fetchExercise.mockResolvedValue({ ...EXERCISE, attachment_url: null })
    renderRoute('/exercises/3')

    await screen.findByText('Instructions')
    expect(screen.queryByText('Supporting material')).not.toBeInTheDocument()
  })
})
