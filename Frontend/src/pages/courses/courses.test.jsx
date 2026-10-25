import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import CoursesPage from './CoursesPage'
import CourseDetailPage from './CourseDetailPage'
import CourseFormPage from './CourseFormPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchCourses: vi.fn(),
  fetchCourse: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  config: {
    max_upload_size_mb: 50,
    max_upload_size_bytes: 50 * 1024 * 1024,
    allowed_extensions: ['pdf', 'mp3', 'wav', 'm4a', 'ogg'],
    pdf_extensions: ['pdf'],
    audio_extensions: ['mp3', 'wav', 'm4a', 'ogg'],
  },
}))

const DEFAULT_CONFIG = { ...mocks.config }

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/courses', () => ({
  fetchCourses: mocks.fetchCourses,
  fetchCourse: mocks.fetchCourse,
  createCourse: mocks.createCourse,
  updateCourse: mocks.updateCourse,
  deleteCourse: mocks.deleteCourse,
}))
vi.mock('../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    config: mocks.config,
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

const TEACHER = {
  id: 7,
  first_name: 'Thomas',
  last_name: 'Teacher',
  full_name: 'Thomas Teacher',
  email: 'teacher@edumind.local',
  role: 'teacher',
}

const STUDENT = {
  id: 9,
  first_name: 'Sofia',
  last_name: 'Student',
  full_name: 'Sofia Student',
  email: 'student@edumind.local',
  role: 'student',
}

const OWNED_COURSE = {
  id: 1,
  title: 'My course',
  description: 'Course fundamentals.',
  type: 'pdf',
  type_display: 'PDF',
  file: null,
  file_url: '/api/courses/1/file/',
  download_url: '/api/courses/1/download/',
  owner: 7,
  owner_name: 'Thomas Teacher',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
}

const OTHER_COURSE = {
  ...OWNED_COURSE,
  id: 2,
  title: "Colleague's course",
  type: 'audio',
  type_display: 'Audio',
  file_url: '/api/courses/2/file/',
  download_url: '/api/courses/2/download/',
  owner: 8,
  owner_name: 'Camille Teacher',
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/dashboard" element={<p>Dashboard</p>} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/new" element={<CourseFormPage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/courses/:courseId/edit" element={<CourseFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function signInAs(user) {
  useAuth.mockReturnValue({ user, status: 'authenticated' })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks.config, DEFAULT_CONFIG)
  signInAs(TEACHER)
  mocks.fetchCourses.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [OWNED_COURSE, OTHER_COURSE],
  })
  mocks.fetchCourse.mockResolvedValue(OWNED_COURSE)
})

describe('CoursesPage', () => {
  it('lists courses and reserves management actions for the owner', async () => {
    renderRoute('/courses')

    expect(await screen.findByRole('heading', { name: 'My course' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit “My course”' })).toHaveAttribute(
      'href',
      '/courses/1/edit',
    )
    expect(screen.queryByRole('link', { name: "Edit “Colleague's course”" })).toBeNull()
    expect(screen.queryByRole('button', { name: "Delete “Colleague's course”" })).toBeNull()
    expect(screen.getByRole('link', { name: /add a course/i })).toHaveAttribute(
      'href',
      '/courses/new',
    )
  })

  it('sends the selected format to the API and resets filters', async () => {
    const user = userEvent.setup()
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    await user.selectOptions(screen.getByLabelText('Format'), 'audio')

    await waitFor(() =>
      expect(mocks.fetchCourses).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'audio' }),
        expect.anything(),
      ),
    )

    await user.click(screen.getByRole('button', { name: /reset filters/i }))

    await waitFor(() =>
      expect(mocks.fetchCourses).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: '' }),
        expect.anything(),
      ),
    )
  })

  it('deletes a course after confirmation', async () => {
    const user = userEvent.setup()
    mocks.deleteCourse.mockResolvedValue(undefined)
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    await user.click(screen.getByRole('button', { name: 'Delete “My course”' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /delete permanently/i }))

    await waitFor(() => expect(mocks.deleteCourse).toHaveBeenCalledWith(1))
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('hides course creation from students', async () => {
    signInAs(STUDENT)
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    expect(screen.queryByRole('link', { name: /add a course/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^edit “/i })).toBeNull()
  })
})

describe('CourseDetailPage', () => {
  it('shows the PDF preview, download link and owner actions', async () => {
    renderRoute('/courses/1')

    expect(await screen.findByRole('heading', { name: 'My course' })).toBeInTheDocument()
    expect(screen.getByTitle('PDF preview: My course')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
      'href',
      '/api/courses/1/download/',
    )
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
      'href',
      '/courses/1/edit',
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('keeps read-only access for students', async () => {
    signInAs(STUDENT)
    renderRoute('/courses/1')

    await screen.findByRole('heading', { name: 'My course' })
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('shows a dedicated state for a missing course', async () => {
    mocks.fetchCourse.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { error: { code: 'not_found', message: 'Course not found.' } },
      },
    })
    renderRoute('/courses/999')

    expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view catalogue/i })).toHaveAttribute(
      'href',
      '/courses',
    )
  })
})

describe('CourseFormPage', () => {
  it('validates the title and the required file before submission', async () => {
    const user = userEvent.setup()
    renderRoute('/courses/new')

    await user.click(await screen.findByRole('button', { name: /publish course/i }))

    expect(screen.getByText('Enter the course title.')).toBeInTheDocument()
    expect(screen.getByText('Select a PDF or audio file.')).toBeInTheDocument()
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('rejects unsupported extensions and oversize files locally', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderRoute('/courses/new')

    const fileInput = await screen.findByLabelText(/drag and drop/i)
    await user.upload(fileInput, new File(['text'], 'notes.txt', { type: 'text/plain' }))

    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()

    mocks.config.max_upload_size_mb = 1
    mocks.config.max_upload_size_bytes = 10
    await user.upload(
      fileInput,
      new File(['content that is far too long'], 'course.pdf', { type: 'application/pdf' }),
    )

    expect(screen.getByText(/maximum size of 1 MB/i)).toBeInTheDocument()
  })

  it('publishes a course and opens its detail page', async () => {
    const user = userEvent.setup()
    const saved = { ...OWNED_COURSE, id: 42, title: 'New course' }
    mocks.createCourse.mockResolvedValue(saved)
    mocks.fetchCourse.mockResolvedValue(saved)
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), '  New course ')
    await user.type(screen.getByLabelText(/description/i), 'Course objectives.')
    await user.upload(
      screen.getByLabelText(/drag and drop/i),
      new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledTimes(1))
    const [formData] = mocks.createCourse.mock.calls[0]
    expect(formData.get('title')).toBe('New course')
    expect(formData.get('description')).toBe('Course objectives.')
    expect(formData.get('file')).toBeInstanceOf(File)

    expect(await screen.findByRole('heading', { name: 'New course' })).toBeInTheDocument()
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('prefills an editable course and saves without replacing the file', async () => {
    const user = userEvent.setup()
    mocks.updateCourse.mockResolvedValue({ ...OWNED_COURSE, title: 'Adjusted title' })
    renderRoute('/courses/1/edit')

    const titleInput = await screen.findByLabelText(/course title/i)
    await waitFor(() => expect(titleInput).toHaveValue('My course'))

    await user.clear(titleInput)
    await user.type(titleInput, 'Adjusted title')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mocks.updateCourse).toHaveBeenCalledTimes(1))
    const [courseId, formData] = mocks.updateCourse.mock.calls[0]
    expect(courseId).toBe('1')
    expect(formData.get('title')).toBe('Adjusted title')
    expect(formData.get('file')).toBeNull()
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('denies editing a course owned by another teacher', async () => {
    mocks.fetchCourse.mockResolvedValue(OTHER_COURSE)
    renderRoute('/courses/2/edit')

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/course title/i)).toBeNull()
  })
})
