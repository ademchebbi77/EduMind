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
  fetchMyCourses: vi.fn(),
  fetchCategories: vi.fn(),
  fetchCourse: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  updateCourseFields: vi.fn(),
  deleteCourse: vi.fn(),
  enrollInCourse: vi.fn(),
  unenrollFromCourse: vi.fn(),
  fetchCourseProgress: vi.fn(),
  updateCourseProgress: vi.fn(),
  fetchCourseTranscript: vi.fn(),
  generateCourseTranscript: vi.fn(),
  fetchRecommendations: vi.fn(),
  analyzeCourseContent: vi.fn(),
  fetchLessons: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderLessons: vi.fn(),
  completeLesson: vi.fn(),
  fetchLessonProgress: vi.fn(),
  config: {
    max_upload_size_mb: 50,
    max_upload_size_bytes: 50 * 1024 * 1024,
    max_video_upload_size_mb: 500,
    max_video_upload_size_bytes: 500 * 1024 * 1024,
    allowed_extensions: ['pdf', 'mp3', 'wav', 'm4a', 'ogg', 'mp4', 'webm', 'avi'],
    pdf_extensions: ['pdf'],
    audio_extensions: ['mp3', 'wav', 'm4a', 'ogg'],
    video_extensions: ['mp4', 'webm', 'avi'],
    thumbnail_extensions: ['jpeg', 'jpg', 'png', 'webp'],
    thumbnail_max_size_mb: 2,
    thumbnail_max_size_bytes: 2 * 1024 * 1024,
  },
}))

const DEFAULT_CONFIG = { ...mocks.config }

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/courses', () => ({
  fetchCourses: mocks.fetchCourses,
  fetchMyCourses: mocks.fetchMyCourses,
  fetchCategories: mocks.fetchCategories,
  fetchCourse: mocks.fetchCourse,
  createCourse: mocks.createCourse,
  updateCourse: mocks.updateCourse,
  updateCourseFields: mocks.updateCourseFields,
  deleteCourse: mocks.deleteCourse,
  enrollInCourse: mocks.enrollInCourse,
  unenrollFromCourse: mocks.unenrollFromCourse,
  fetchCourseProgress: mocks.fetchCourseProgress,
  updateCourseProgress: mocks.updateCourseProgress,
  fetchCourseTranscript: mocks.fetchCourseTranscript,
  generateCourseTranscript: mocks.generateCourseTranscript,
  fetchRecommendations: mocks.fetchRecommendations,
  analyzeCourseContent: mocks.analyzeCourseContent,
  fetchLessons: mocks.fetchLessons,
  createLesson: mocks.createLesson,
  updateLesson: mocks.updateLesson,
  deleteLesson: mocks.deleteLesson,
  reorderLessons: mocks.reorderLessons,
  completeLesson: mocks.completeLesson,
  fetchLessonProgress: mocks.fetchLessonProgress,
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
  video_url: '',
  thumbnail_url: null,
  category: null,
  category_name: null,
  category_slug: null,
  tags: [],
  owner: 7,
  owner_name: 'Thomas Teacher',
  max_students: null,
  enrolled_count: 0,
  is_full: false,
  is_enrolled: false,
  can_enroll: false,
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

const OWNED_VIDEO_COURSE = {
  ...OWNED_COURSE,
  type: 'video',
  type_display: 'Video',
  has_file: true,
  video_url: '',
}

const COURSE_LESSONS = [
  {
    id: 21,
    course: 1,
    title: 'Course intro',
    description: '',
    order: 1,
    file_url: '/api/courses/1/lessons/21/file/',
    file_type: 'pdf',
    video_url: '',
    duration_minutes: 12,
    is_published: true,
    is_locked: false,
    is_completed: false,
    completed_at: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
  },
]

const RECOMMENDED_COURSE = {
  ...OTHER_COURSE,
  id: 5,
  title: 'Machine learning foundations',
  description: 'Train your first models.',
  category: 'Programming',
  category_id: 3,
  category_name: 'Programming',
  thumbnail_url: null,
  is_enrolled: false,
  can_enroll: true,
  confidence: 0.87,
  reason: 'Based on your enrollment in Python Basics',
}

const EMPTY_TRANSCRIPT = {
  status: 'none',
  status_display: 'Not generated',
  stage: '',
  stage_display: '',
  progress: 0,
  language: '',
  model_name: '',
  text: '',
  formatted_by_ai: false,
  segment_count: 0,
  error_message: '',
  started_at: null,
  completed_at: null,
  updated_at: null,
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
  mocks.fetchMyCourses.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [OWNED_COURSE],
  })
  mocks.fetchCategories.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        id: 3,
        name: 'Science',
        slug: 'science',
        description: 'Scientific courses.',
        created_at: '2026-10-01T10:00:00Z',
      },
    ],
  })
  mocks.fetchCourse.mockResolvedValue(OWNED_COURSE)
  mocks.fetchCourseProgress.mockResolvedValue({
    progress: 0,
    completed: false,
    completed_at: null,
    has_opened_material: false,
    video_duration_seconds: 0,
    video_watched_seconds: 0,
    last_position_seconds: 0,
    total_pages: 1,
    pages_viewed: 0,
    first_viewed_at: null,
    last_viewed_at: null,
  })
  mocks.fetchCourseTranscript.mockResolvedValue(EMPTY_TRANSCRIPT)
  mocks.fetchRecommendations.mockResolvedValue({
    recommendations: [],
    algorithm: 'hybrid',
    computed_in_ms: 5,
  })
  mocks.generateCourseTranscript.mockResolvedValue({
    ...EMPTY_TRANSCRIPT,
    status: 'queued',
    status_display: 'Queued',
    stage: 'queued',
    stage_display: 'Queued',
    language: 'en',
  })
  mocks.fetchLessons.mockResolvedValue([])
  mocks.createLesson.mockResolvedValue({ id: 100 })
  mocks.updateLesson.mockResolvedValue({ id: 21 })
  mocks.deleteLesson.mockResolvedValue(undefined)
  mocks.reorderLessons.mockResolvedValue([])
  mocks.updateCourseProgress.mockImplementation((courseId, payload) =>
    Promise.resolve({
      progress: 0,
      completed: false,
      completed_at: null,
      has_opened_material: true,
      video_duration_seconds: 0,
      video_watched_seconds: 0,
      last_position_seconds: 0,
      total_pages: 1,
      pages_viewed: 0,
      first_viewed_at: null,
      last_viewed_at: null,
      ...payload,
    }),
  )
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

  it('filters the catalogue by category and tags', async () => {
    const user = userEvent.setup()
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    await user.selectOptions(screen.getByLabelText('Category'), 'science')
    await user.type(screen.getByLabelText('Tags'), 'physics')

    await waitFor(() =>
      expect(mocks.fetchCourses).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'science', tags: 'physics' }),
        expect.anything(),
      ),
    )
  })

  it('uses the my-courses endpoint for students who enable My courses', async () => {
    const user = userEvent.setup()
    signInAs(STUDENT)
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    await user.click(screen.getByLabelText('My courses'))

    await waitFor(() => expect(mocks.fetchMyCourses).toHaveBeenCalled())
  })

  it('enrolls a student from the catalogue', async () => {
    const user = userEvent.setup()
    signInAs(STUDENT)
    mocks.enrollInCourse.mockResolvedValue({ id: 11 })
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    await user.click(screen.getAllByRole('button', { name: 'Enroll' })[0])

    await waitFor(() => expect(mocks.enrollInCourse).toHaveBeenCalledWith(1))
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
    expect(await screen.findByRole('button', { name: /leave course/i })).toBeInTheDocument()
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

  it('shows personalized recommendations to students', async () => {
    signInAs(STUDENT)
    mocks.fetchRecommendations.mockResolvedValue({
      recommendations: [RECOMMENDED_COURSE],
      algorithm: 'hybrid',
      computed_in_ms: 12,
    })
    renderRoute('/courses')

    expect(
      await screen.findByRole('heading', { name: 'Recommended for you' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: RECOMMENDED_COURSE.title })).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('87% match')).toBeInTheDocument()
    expect(
      screen.getByText('Based on your enrollment in Python Basics'),
    ).toBeInTheDocument()
    expect(screen.getByText('Hybrid ML')).toBeInTheDocument()
  })

  it('does not request recommendations for teachers', async () => {
    renderRoute('/courses')

    await screen.findByRole('heading', { name: 'My course' })
    expect(mocks.fetchRecommendations).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', { name: 'Recommended for you' }),
    ).toBeNull()
  })

  it('falls back to popular courses when recommendations fail', async () => {
    signInAs(STUDENT)
    mocks.fetchRecommendations.mockRejectedValue(new Error('offline'))
    mocks.fetchCourses.mockImplementation((params) =>
      Promise.resolve(
        params.ordering === '-enrolled_count'
          ? {
              count: 1,
              next: null,
              previous: null,
              results: [RECOMMENDED_COURSE],
            }
          : {
              count: 2,
              next: null,
              previous: null,
              results: [OWNED_COURSE, OTHER_COURSE],
            },
      ),
    )
    renderRoute('/courses')

    expect(
      await screen.findByRole('heading', { name: 'Popular courses' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Popular with students.')).toBeInTheDocument()
    expect(mocks.fetchCourses).toHaveBeenCalledWith(
      expect.objectContaining({ ordering: '-enrolled_count', pageSize: 5 }),
      expect.anything(),
    )
  })
})

describe('CourseDetailPage', () => {
  it('shows the lessons interface and owner actions', async () => {
    mocks.fetchCourse.mockResolvedValue({
      ...OWNED_COURSE,
      lessons: COURSE_LESSONS,
      lesson_count: 1,
    })
    renderRoute('/courses/1')

    expect(await screen.findByRole('heading', { name: 'My course' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /course intro/i })).toHaveAttribute(
      'href',
      '/courses/1/lessons/21',
    )
    expect(screen.getByText('1 lesson')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /edit course/i })).toHaveAttribute(
      'href',
      '/courses/1/edit',
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
  })

  it('shows the empty lessons state when a course has no lessons', async () => {
    mocks.fetchCourse.mockResolvedValue({ ...OWNED_COURSE, lessons: [] })
    renderRoute('/courses/1')

    expect(await screen.findByText('This course has no lessons yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first lesson to get started.')).toBeInTheDocument()
  })

  it('keeps read-only access for students', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({ ...OWNED_COURSE, lessons: COURSE_LESSONS })
    renderRoute('/courses/1')

    await screen.findByRole('heading', { name: 'My course' })
    expect(screen.queryByRole('link', { name: /edit course/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
  })

  it('shows lesson progress for enrolled students', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({
      ...OWNED_COURSE,
      is_enrolled: true,
      can_enroll: false,
      enrolled_count: 1,
      completed_lessons: 1,
      progress_percentage: 50,
      lessons: [
        { ...COURSE_LESSONS[0], is_completed: true },
        {
          ...COURSE_LESSONS[0],
          id: 22,
          title: 'Second lesson',
          order: 2,
          is_locked: true,
        },
      ],
    })

    renderRoute('/courses/1')

    expect(
      await screen.findByRole('heading', { name: 'Your progress' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('1 of 2 lessons completed')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    expect(mocks.fetchCourseProgress).not.toHaveBeenCalled()
  })

  it('lets the course owner generate a video transcript with progress', async () => {
    const user = userEvent.setup()
    mocks.fetchCourse.mockResolvedValue(OWNED_VIDEO_COURSE)
    mocks.generateCourseTranscript.mockResolvedValue({
      ...EMPTY_TRANSCRIPT,
      status: 'processing',
      status_display: 'Processing',
      stage: 'transcribing',
      stage_display: 'Transcribing audio',
      progress: 40,
      language: 'en',
      segment_count: 4,
    })

    renderRoute('/courses/1')

    const language = await screen.findByRole('combobox', {
      name: 'Spoken language',
    })
    await user.selectOptions(language, 'fr')
    await user.click(
      screen.getByRole('button', { name: /generate transcript/i }),
    )

    expect(mocks.generateCourseTranscript).toHaveBeenCalledWith(1, {
      language: 'fr',
    })
    expect(await screen.findByText('Transcribing the audio…')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', {
        name: 'Transcript generation progress',
      }),
    ).toHaveAttribute('aria-valuenow', '40')
  })

  it('shows a generated transcript with timestamps to enrolled students', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({
      ...OWNED_VIDEO_COURSE,
      is_enrolled: true,
      can_enroll: false,
      enrolled_count: 1,
    })
    mocks.fetchCourseTranscript.mockResolvedValue({
      ...EMPTY_TRANSCRIPT,
      status: 'completed',
      status_display: 'Completed',
      stage: 'done',
      stage_display: 'Complete',
      progress: 100,
      language: 'en',
      text: '[00:00] Welcome to the lesson.\n\n[02:00] Here is the next part.',
      formatted_by_ai: true,
      completed_at: '2026-10-25T10:00:00Z',
    })

    renderRoute('/courses/1')

    expect(await screen.findByText('Welcome to the lesson.')).toBeInTheDocument()
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByText('Here is the next part.')).toBeInTheDocument()
    expect(screen.getByText('02:00')).toBeInTheDocument()
    expect(screen.getByText('AI formatted')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /generate transcript/i }),
    ).toBeNull()
  })

  it('offers a retry when transcript generation failed', async () => {
    mocks.fetchCourse.mockResolvedValue(OWNED_VIDEO_COURSE)
    mocks.fetchCourseTranscript.mockResolvedValue({
      ...EMPTY_TRANSCRIPT,
      status: 'failed',
      status_display: 'Failed',
      stage: 'failed',
      stage_display: 'Failed',
      error_message: 'The audio track could not be extracted.',
    })

    renderRoute('/courses/1')

    expect(
      await screen.findByText('The audio track could not be extracted.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('does not show transcript controls to students who are not enrolled', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue(OWNED_VIDEO_COURSE)

    renderRoute('/courses/1')

    await screen.findByRole('heading', { name: 'My course' })
    expect(
      screen.queryByRole('heading', { name: 'Video transcript' }),
    ).toBeNull()
    expect(mocks.fetchCourseTranscript).not.toHaveBeenCalled()
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
  it('validates the title and requires at least one lesson', async () => {
    const user = userEvent.setup()
    renderRoute('/courses/new')

    await user.click(await screen.findByRole('button', { name: /publish course/i }))

    expect(screen.getByText('Enter the course title.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Add at least one lesson. Each lesson needs a file or a video link.',
      ),
    ).toBeInTheDocument()
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('rejects unsupported lesson files and oversize uploads locally', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderRoute('/courses/new')

    await user.click(await screen.findByRole('button', { name: /add lesson/i }))
    const fileInput = screen.getByLabelText(/choose file/i)
    await user.upload(fileInput, new File(['text'], 'notes.txt', { type: 'text/plain' }))

    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()

    mocks.config.max_upload_size_mb = 1
    mocks.config.max_upload_size_bytes = 10
    await user.upload(
      fileInput,
      new File(['content that is far too long'], 'lesson.pdf', { type: 'application/pdf' }),
    )

    expect(screen.getByText(/maximum size of 1 MB/i)).toBeInTheDocument()
  })

  it('rejects a non-supported video URL inside a lesson', async () => {
    const user = userEvent.setup()
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), 'Video course')
    await user.click(screen.getByRole('button', { name: /add lesson/i }))
    await user.type(screen.getByLabelText(/lesson title/i), 'Watch')
    await user.type(
      screen.getByLabelText(/video link/i),
      'https://example.com/watch?v=123',
    )
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    expect(
      screen.getByText('Only YouTube and Vimeo links are supported.'),
    ).toBeInTheDocument()
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('publishes a course and opens its detail page', async () => {
    const user = userEvent.setup()
    const saved = { ...OWNED_COURSE, id: 42, title: 'New course' }
    mocks.createCourse.mockResolvedValue(saved)
    mocks.createLesson.mockResolvedValue({ id: 100, title: 'First lesson' })
    mocks.fetchCourse.mockResolvedValue({ ...saved, lessons: [], lesson_count: 0 })
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), '  New course ')
    await user.type(screen.getByLabelText(/description/i), 'Course objectives.')
    await user.click(screen.getByRole('button', { name: /add lesson/i }))
    await user.type(screen.getByLabelText(/lesson title/i), 'First lesson')
    await user.upload(
      screen.getByLabelText(/choose file/i),
      new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledTimes(1))
    const [formData] = mocks.createCourse.mock.calls[0]
    expect(formData.get('title')).toBe('New course')
    expect(formData.get('description')).toBe('Course objectives.')
    expect(formData.get('file')).toBeNull()
    expect(formData.get('video_url')).toBeNull()

    await waitFor(() => expect(mocks.createLesson).toHaveBeenCalledTimes(1))
    const [courseId, lessonData] = mocks.createLesson.mock.calls[0]
    expect(courseId).toBe(42)
    expect(lessonData.get('title')).toBe('First lesson')
    expect(lessonData.get('file')).toBeInstanceOf(File)

    expect(await screen.findByRole('heading', { name: 'New course' })).toBeInTheDocument()
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('prefills an editable course and saves its existing lessons', async () => {
    const user = userEvent.setup()
    mocks.fetchLessons.mockResolvedValue(COURSE_LESSONS)
    mocks.updateCourse.mockResolvedValue({ ...OWNED_COURSE, title: 'Adjusted title' })
    renderRoute('/courses/1/edit')

    const titleInput = await screen.findByLabelText(/course title/i)
    await waitFor(() => expect(titleInput).toHaveValue('My course'))
    expect(await screen.findByDisplayValue('Course intro')).toBeInTheDocument()

    await user.clear(titleInput)
    await user.type(titleInput, 'Adjusted title')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mocks.updateCourse).toHaveBeenCalledTimes(1))
    const [courseId, formData] = mocks.updateCourse.mock.calls[0]
    expect(courseId).toBe('1')
    expect(formData.get('title')).toBe('Adjusted title')
    expect(formData.get('file')).toBeNull()

    await waitFor(() => expect(mocks.updateLesson).toHaveBeenCalledTimes(1))
    const [lessonCourseId, lessonId, lessonData] = mocks.updateLesson.mock.calls[0]
    expect(lessonCourseId).toBe(1)
    expect(lessonId).toBe(21)
    expect(lessonData.get('video_url')).toBe('')
    expect(lessonData.get('file')).toBeNull()

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

  it('auto-fills the form from a selected file and submits the suggestions', async () => {
    const user = userEvent.setup()
    mocks.analyzeCourseContent.mockResolvedValue({
      title: 'Python Programming Basics',
      description:
        'Learn variables, loops and functions in Python. This beginner course covers coding fundamentals and simple algorithms.',
      category: 'Science',
      category_id: 3,
      tags: ['python', 'programming', 'loops', 'functions', 'beginner'],
      difficulty: 'beginner',
      confidence: { title: 0.82, category: 0.91, difficulty: 0.74 },
      processing_time_ms: 1250,
      source: 'pdf',
      word_count: 420,
      warnings: [],
    })
    mocks.createCourse.mockResolvedValue({
      ...OWNED_COURSE,
      id: 42,
      title: 'Python Programming Basics',
      difficulty: 'beginner',
      difficulty_display: 'Beginner',
    })
    mocks.createLesson.mockResolvedValue({ id: 100, title: 'Python lesson' })
    mocks.fetchCourse.mockResolvedValue({
      ...OWNED_COURSE,
      id: 42,
      title: 'Python Programming Basics',
      difficulty: 'beginner',
      difficulty_display: 'Beginner',
      lessons: [],
    })
    renderRoute('/courses/new')

    await user.click(await screen.findByRole('button', { name: /add lesson/i }))
    await user.type(screen.getByLabelText(/lesson title/i), 'Python lesson')
    await user.upload(
      screen.getByLabelText(/choose file/i),
      new File(['%PDF-1.4'], 'python_basics.pdf', { type: 'application/pdf' }),
    )

    const autoFill = screen.getByRole('button', { name: /auto-fill with ai/i })
    expect(autoFill).toBeEnabled()
    await user.click(autoFill)

    expect(await screen.findByRole('status')).toHaveTextContent(
      /suggestions applied from your pdf/i,
    )
    expect(mocks.analyzeCourseContent).toHaveBeenCalledWith({
      file: expect.any(File),
    })
    expect(screen.getByLabelText(/course title/i)).toHaveValue(
      'Python Programming Basics',
    )
    expect(screen.getByLabelText('Description', { exact: true })).toHaveValue(
      'Learn variables, loops and functions in Python. This beginner course covers coding fundamentals and simple algorithms.',
    )
    expect(screen.getByLabelText(/category/i)).toHaveValue('3')
    expect(screen.getByLabelText(/difficulty/i)).toHaveValue('beginner')
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText('programming')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /publish course/i }))

    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledTimes(1))
    const [formData] = mocks.createCourse.mock.calls[0]
    expect(formData.get('title')).toBe('Python Programming Basics')
    expect(formData.get('category')).toBe('3')
    expect(formData.get('difficulty')).toBe('beginner')
    expect(formData.get('tags')).toContain('python')
  })

  it('auto-fills an existing course from its uploaded material', async () => {
    const user = userEvent.setup()
    mocks.fetchCourse.mockResolvedValue({
      ...OWNED_COURSE,
      difficulty: 'intermediate',
      difficulty_display: 'Intermediate',
    })
    mocks.analyzeCourseContent.mockResolvedValue({
      title: 'Updated title',
      description: 'A concise summary of the existing course material.',
      category: 'Science',
      category_id: 3,
      tags: ['science', 'research', 'methods', 'analysis', 'data'],
      difficulty: 'advanced',
      confidence: { title: 0.95, category: 0.8, difficulty: 0.7 },
      processing_time_ms: 900,
      source: 'transcript',
      word_count: 120,
      warnings: [],
    })
    renderRoute('/courses/1/edit')

    await screen.findByDisplayValue('My course')
    await user.click(screen.getByRole('button', { name: /auto-fill with ai/i }))

    await waitFor(() =>
      expect(mocks.analyzeCourseContent).toHaveBeenCalledWith({ courseId: '1' }),
    )
    expect(await screen.findByLabelText(/course title/i)).toHaveValue('Updated title')
    expect(screen.getByLabelText(/difficulty/i)).toHaveValue('advanced')
    expect(screen.getByRole('status')).toHaveTextContent(/course transcript/i)
  })

  it('shows an inline error when auto-fill fails', async () => {
    const user = userEvent.setup()
    mocks.analyzeCourseContent.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'invalid_file',
            message: 'The audio track could not be extracted from this file.',
            fields: {
              file: ['The audio track could not be extracted from this file.'],
            },
          },
        },
      },
    })
    renderRoute('/courses/new')

    await user.click(await screen.findByRole('button', { name: /add lesson/i }))
    await user.upload(
      screen.getByLabelText(/choose file/i),
      new File(['%PDF-1.4'], 'broken.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /auto-fill with ai/i }))

    expect(
      await screen.findByText(/audio track could not be extracted/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
