import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { LessonList } from '../../components/courses/LessonList'
import CourseDetailPage from './CourseDetailPage'
import CourseFormPage from './CourseFormPage'
import LessonPlayerPage from './LessonPlayerPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchCourse: vi.fn(),
  fetchLessons: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderLessons: vi.fn(),
  completeLesson: vi.fn(),
  fetchCourseProgress: vi.fn(),
  updateCourseProgress: vi.fn(),
  createCourse: vi.fn(),
  fetchCategories: vi.fn(),
  fetchLessonTranscript: vi.fn(),
  generateLessonTranscript: vi.fn(),
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
  fetchCourse: mocks.fetchCourse,
  fetchLessons: mocks.fetchLessons,
  createLesson: mocks.createLesson,
  updateLesson: mocks.updateLesson,
  deleteLesson: mocks.deleteLesson,
  reorderLessons: mocks.reorderLessons,
  completeLesson: mocks.completeLesson,
  fetchCourseProgress: mocks.fetchCourseProgress,
  updateCourseProgress: mocks.updateCourseProgress,
  createCourse: mocks.createCourse,
  fetchCategories: mocks.fetchCategories,
  fetchLessonTranscript: mocks.fetchLessonTranscript,
  generateLessonTranscript: mocks.generateLessonTranscript,
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

function lesson(overrides) {
  return {
    id: 1,
    course: 1,
    title: 'Introduction',
    description: '',
    order: 1,
    file_url: '/api/courses/1/lessons/1/file/',
    file_type: 'pdf',
    video_url: '',
    duration_minutes: null,
    is_published: true,
    is_locked: false,
    is_completed: false,
    completed_at: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
    ...overrides,
  }
}

const COURSE = {
  id: 1,
  title: 'Sequential course',
  description: 'Learn step by step.',
  type: 'pdf',
  type_display: 'PDF',
  file_url: '',
  download_url: '',
  video_url: '',
  thumbnail_url: null,
  category: null,
  category_name: null,
  category_slug: null,
  tags: [],
  owner: 7,
  owner_name: 'Thomas Teacher',
  max_students: null,
  enrolled_count: 1,
  is_full: false,
  is_enrolled: true,
  can_enroll: false,
  has_file: false,
  lesson_count: 3,
  completed_lessons: 0,
  progress_percentage: 0,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
}

const LESSONS = [
  lesson({
    id: 1,
    title: 'Introduction',
    order: 1,
    file_type: 'pdf',
    duration_minutes: 10,
    is_completed: true,
    completed_at: '2026-10-20T10:00:00Z',
  }),
  lesson({
    id: 2,
    title: 'Deep dive',
    order: 2,
    file_type: 'video',
    duration_minutes: 25,
    is_locked: true,
  }),
  lesson({
    id: 3,
    title: 'Practice',
    order: 3,
    file_type: 'audio',
    is_locked: true,
  }),
]

const PLAYER_LESSONS = [
  lesson({ id: 1, title: 'Introduction', order: 1, file_type: 'pdf', duration_minutes: 10 }),
  lesson({
    id: 2,
    title: 'Deep dive',
    order: 2,
    file_type: 'video',
    duration_minutes: 25,
    is_locked: true,
  }),
  lesson({ id: 3, title: 'Practice', order: 3, file_type: 'audio', is_locked: true }),
]

function renderList(props) {
  return render(
    <MemoryRouter>
      <LessonList
        course={COURSE}
        lessons={LESSONS}
        isStudent={false}
        isEnrolled={false}
        canManage={false}
        {...props}
      />
    </MemoryRouter>,
  )
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/courses/new" element={<CourseFormPage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonPlayerPage />} />
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
  mocks.fetchCategories.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
  mocks.fetchLessons.mockResolvedValue([])
  mocks.completeLesson.mockResolvedValue({
    lesson_id: 1,
    next_lesson_id: 2,
    is_completed: true,
    completed_at: '2026-10-26T10:00:00Z',
    course_completed: false,
    course_progress: {
      total_lessons: 2,
      completed_lessons: 1,
      locked_lessons: 1,
      percentage: 50,
    },
  })
})

describe('LessonList', () => {
  it('lists lessons in order with completion marks and lock icons', () => {
    renderList({ isStudent: true, isEnrolled: true })

    expect(screen.getByRole('link', { name: /introduction/i })).toHaveAttribute(
      'href',
      '/courses/1/lessons/1',
    )
    expect(screen.getByText('Completed')).toBeInTheDocument()

    expect(screen.getByText(/deep dive/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /deep dive/i })).toBeNull()
    expect(screen.getByLabelText('Deep dive — locked')).toBeInTheDocument()
    expect(screen.getByText('Complete lesson 1 first')).toBeInTheDocument()
    expect(screen.getByText('Complete lesson 2 first')).toBeInTheDocument()
  })

  it('locks every lesson for students who are not enrolled', () => {
    const open = LESSONS.map((item) => ({
      ...item,
      is_completed: false,
      completed_at: null,
      is_locked: false,
    }))
    renderList({ lessons: open, isStudent: true, isEnrolled: false })

    expect(screen.queryByRole('link', { name: /introduction/i })).toBeNull()
    expect(screen.getAllByText('Enroll to start learning')).toHaveLength(3)
  })

  it('shows a start label on unlocked lessons', () => {
    const unlocked = LESSONS.map((item) => ({ ...item, is_locked: false }))
    renderList({ lessons: unlocked, isStudent: true, isEnrolled: true })

    expect(screen.getAllByText('Start')).toHaveLength(2)
  })

  it('labels lessons that only have an external video', () => {
    const external = lesson({
      id: 1,
      title: 'YouTube lesson',
      file_url: null,
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    renderList({ lessons: [external], isStudent: true, isEnrolled: true })

    expect(screen.getByText('External video')).toBeInTheDocument()
  })

  it('shows the empty state with a hint for course managers', () => {
    renderList({ lessons: [], canManage: true })

    expect(screen.getByText('This course has no lessons yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first lesson to get started.')).toBeInTheDocument()
  })
})

describe('CourseDetailPage progress for lesson courses', () => {
  it('derives the progress bar from lesson completions', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({
      ...COURSE,
      lesson_count: 4,
      completed_lessons: 2,
      progress_percentage: 50,
      lessons: [
        ...LESSONS,
        lesson({ id: 4, title: 'Capstone', order: 4, is_locked: true }),
      ],
    })
    renderRoute('/courses/1')

    expect(await screen.findByText('2 of 4 lessons completed')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Course progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
  })
})

describe('LessonPlayerPage', () => {
  it('blocks access to a locked lesson and points to the previous one', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: PLAYER_LESSONS })
    renderRoute('/courses/1/lessons/2')

    expect(
      await screen.findByText('Complete the previous lesson first to unlock this one.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark as complete/i })).toBeNull()
    expect(screen.getByRole('link', { name: /go to lesson 1/i })).toBeInTheDocument()
  })

  it('marks a lesson complete manually and unlocks the next one', async () => {
    const user = userEvent.setup()
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: PLAYER_LESSONS })
    renderRoute('/courses/1/lessons/1')

    await user.click(await screen.findByRole('button', { name: /mark as complete/i }))

    await waitFor(() => expect(mocks.completeLesson).toHaveBeenCalledWith('1', 1))
    expect(mocks.addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Lesson “Introduction” completed.',
    })
    expect(await screen.findByRole('link', { name: /next lesson/i })).toBeInTheDocument()
  })

  it('shows the course-completed banner on the final lesson', async () => {
    const user = userEvent.setup()
    signInAs(STUDENT)
    const finalLesson = lesson({ id: 3, title: 'Practice', order: 3, file_type: 'audio' })
    const openLessons = PLAYER_LESSONS.slice(0, 2).map((item) => ({
      ...item,
      is_locked: false,
      is_completed: true,
    }))
    mocks.fetchCourse.mockResolvedValue({
      ...COURSE,
      lessons: [...openLessons, finalLesson],
    })
    mocks.completeLesson.mockResolvedValue({
      lesson_id: 3,
      next_lesson_id: null,
      is_completed: true,
      completed_at: '2026-10-26T10:00:00Z',
      course_completed: true,
      course_progress: {
        total_lessons: 3,
        completed_lessons: 3,
        locked_lessons: 0,
        percentage: 100,
      },
    })
    renderRoute('/courses/1/lessons/3')

    await user.click(await screen.findByRole('button', { name: /mark as complete/i }))

    expect(await screen.findByText('Course completed!')).toBeInTheDocument()
  })

  it('auto-completes a PDF lesson on open', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: PLAYER_LESSONS })
    renderRoute('/courses/1/lessons/1')

    await waitFor(() => expect(mocks.completeLesson).toHaveBeenCalledWith('1', 1))
  })

  it('auto-completes a video after 90 percent playback', async () => {
    signInAs(STUDENT)
    const videoLesson = lesson({ id: 2, title: 'Deep dive', order: 2, file_type: 'video' })
    const openLessons = PLAYER_LESSONS.slice(0, 1).map((item) => ({ ...item, is_locked: false }))
    mocks.fetchCourse.mockResolvedValue({
      ...COURSE,
      lessons: [...openLessons, videoLesson],
    })
    renderRoute('/courses/1/lessons/2')

    const video = await screen.findByLabelText('Lesson video: Deep dive')
    expect(mocks.completeLesson).not.toHaveBeenCalled()

    Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 95 })
    fireEvent.timeUpdate(video)

    await waitFor(() => expect(mocks.completeLesson).toHaveBeenCalledWith('1', 2))
  })

  it('embeds an external YouTube video and completes it on open', async () => {
    signInAs(STUDENT)
    const external = lesson({
      id: 1,
      title: 'YouTube lesson',
      file_type: 'video',
      file_url: null,
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: [external] })
    renderRoute('/courses/1/lessons/1')

    const frame = await screen.findByTitle('Lesson external video: YouTube lesson')
    expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(screen.getByRole('link', { name: /open video in a new tab/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
    expect(screen.getByText('External video')).toBeInTheDocument()

    await waitFor(() => expect(mocks.completeLesson).toHaveBeenCalledWith('1', 1))
  })

  it('plays an uploaded file and an external Vimeo link together', async () => {
    signInAs(STUDENT)
    const mixed = lesson({
      id: 1,
      title: 'Mixed lesson',
      file_type: 'video',
      video_url: 'https://vimeo.com/123456789',
    })
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: [mixed] })
    renderRoute('/courses/1/lessons/1')

    expect(await screen.findByLabelText('Lesson video: Mixed lesson')).toBeInTheDocument()
    expect(screen.getByTitle('Lesson external video: Mixed lesson')).toHaveAttribute(
      'src',
      'https://player.vimeo.com/video/123456789',
    )
    expect(screen.getByText('Lesson file')).toBeInTheDocument()
    expect(screen.getByText('External video')).toBeInTheDocument()
    expect(mocks.completeLesson).not.toHaveBeenCalled()
  })

  it('offers an AI transcript under uploaded media lessons', async () => {
    signInAs(STUDENT)
    const videoLesson = lesson({
      id: 2,
      title: 'Deep dive',
      order: 2,
      file_type: 'video',
    })
    const openLessons = PLAYER_LESSONS.slice(0, 1).map((item) => ({
      ...item,
      is_locked: false,
    }))
    mocks.fetchCourse.mockResolvedValue({
      ...COURSE,
      lessons: [...openLessons, videoLesson],
    })
    renderRoute('/courses/1/lessons/2')

    expect(
      await screen.findByRole('button', { name: 'Transcript' }),
    ).toBeInTheDocument()
    expect(mocks.fetchLessonTranscript).not.toHaveBeenCalled()
  })

  it('does not offer a transcript for PDF lessons', async () => {
    signInAs(STUDENT)
    mocks.fetchCourse.mockResolvedValue({ ...COURSE, lessons: PLAYER_LESSONS })
    renderRoute('/courses/1/lessons/1')

    await screen.findByTitle('Lesson document: Introduction')
    expect(screen.queryByRole('button', { name: 'Transcript' })).toBeNull()
  })
})

describe('CourseFormPage lessons editor', () => {
  it('publishes a lesson-only course and creates its lessons', async () => {
    const user = userEvent.setup()
    const saved = { ...COURSE, id: 42, title: 'Sequential course', is_enrolled: false }
    mocks.createCourse.mockResolvedValue(saved)
    mocks.createLesson.mockResolvedValue(
      lesson({ id: 10, title: 'Lesson one', file_type: 'pdf' }),
    )
    mocks.fetchCourse.mockResolvedValue({
      ...saved,
      lesson_count: 1,
      lessons: [lesson({ id: 10, title: 'Lesson one' })],
    })
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), 'Sequential course')
    await user.click(screen.getByRole('button', { name: /add lesson/i }))
    await user.type(screen.getByLabelText(/lesson title/i), 'Lesson one')
    await user.upload(
      screen.getByLabelText(/choose file/i),
      new File(['%PDF-1.4'], 'lesson1.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledTimes(1))
    const [courseData] = mocks.createCourse.mock.calls[0]
    expect(courseData.get('title')).toBe('Sequential course')
    expect(courseData.get('file')).toBeNull()
    expect(courseData.get('video_url')).toBeNull()

    await waitFor(() => expect(mocks.createLesson).toHaveBeenCalledTimes(1))
    const [courseId, lessonData] = mocks.createLesson.mock.calls[0]
    expect(courseId).toBe(42)
    expect(lessonData.get('title')).toBe('Lesson one')
    expect(lessonData.get('file')).toBeInstanceOf(File)
    expect(lessonData.get('video_url')).toBe('')

    expect(await screen.findByRole('heading', { name: 'Sequential course' })).toBeInTheDocument()
  })

  it('creates a lesson that only has a YouTube link', async () => {
    const user = userEvent.setup()
    const saved = { ...COURSE, id: 43, title: 'Video course', is_enrolled: false }
    mocks.createCourse.mockResolvedValue(saved)
    mocks.createLesson.mockResolvedValue(
      lesson({
        id: 11,
        title: 'Watch',
        file_url: null,
        file_type: 'video',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    )
    mocks.fetchCourse.mockResolvedValue({ ...saved, lessons: [] })
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), 'Video course')
    await user.click(screen.getByRole('button', { name: /add lesson/i }))
    await user.type(screen.getByLabelText(/lesson title/i), 'Watch')
    await user.type(
      screen.getByLabelText(/video link/i),
      'https://youtu.be/dQw4w9WgXcQ',
    )
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    await waitFor(() => expect(mocks.createLesson).toHaveBeenCalledTimes(1))
    const [, lessonData] = mocks.createLesson.mock.calls[0]
    expect(lessonData.get('video_url')).toBe('https://youtu.be/dQw4w9WgXcQ')
    expect(lessonData.get('file')).toBeNull()
  })

  it('does not render a course material section anymore', async () => {
    renderRoute('/courses/new')

    await screen.findByLabelText(/course title/i)

    expect(screen.queryByText(/course material/i)).toBeNull()
    expect(screen.queryByLabelText(/drag and drop/i)).toBeNull()
    expect(screen.queryByLabelText(/video link/i)).toBeNull()
  })

  it('requires at least one lesson', async () => {
    const user = userEvent.setup()
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), 'No lessons')
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    expect(
      screen.getByText(
        'Add at least one lesson. Each lesson needs a file or a video link.',
      ),
    ).toBeInTheDocument()
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('blocks saving while a lesson row is incomplete', async () => {
    const user = userEvent.setup()
    renderRoute('/courses/new')

    await user.type(await screen.findByLabelText(/course title/i), 'Sequential course')
    await user.click(screen.getByRole('button', { name: /add lesson/i }))
    await user.click(screen.getByRole('button', { name: /publish course/i }))

    expect(
      screen.getByText('Please fix the highlighted lessons before saving.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Enter a lesson title.')).toBeInTheDocument()
    expect(
      screen.getByText('Upload a file or provide a YouTube/Vimeo link.'),
    ).toBeInTheDocument()
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('rejects an unsupported video link inside a lesson', async () => {
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

  it('rejects unsupported lesson file extensions and oversize files locally', async () => {
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
})
