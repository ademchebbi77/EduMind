import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyCoursesPage from './MyCoursesPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchMyCourses: vi.fn(),
  fetchCourseEnrollments: vi.fn(),
  enrollInCourse: vi.fn(),
  unenrollFromCourse: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, role: 'student', full_name: 'Sofia Student' } }),
}))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/courses', () => ({
  fetchMyCourses: mocks.fetchMyCourses,
  fetchCourseEnrollments: mocks.fetchCourseEnrollments,
  enrollInCourse: mocks.enrollInCourse,
  unenrollFromCourse: mocks.unenrollFromCourse,
}))

const COURSE = {
  id: 1,
  title: 'My course',
  description: 'Course fundamentals.',
  type: 'pdf',
  type_display: 'PDF',
  thumbnail_url: null,
  category_name: null,
  owner_name: 'Thomas Teacher',
  is_enrolled: true,
  can_enroll: false,
  is_full: false,
  enrolled_count: 1,
  max_students: null,
}

const ENROLLMENT = {
  id: 11,
  course: 1,
  course_title: 'My course',
  student: 9,
  student_name: 'Sofia Student',
  progress: 0,
  completed: false,
  completed_at: null,
  total_pages: 5,
  pages_viewed: 0,
  video_duration_seconds: 0,
  video_watched_seconds: 0,
  enrolled_at: '2026-10-01T10:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyCoursesPage />
    </MemoryRouter>,
  )
}

function statValue(label) {
  return screen
    .getByText((content, element) => element.tagName === 'P' && content === label)
    .previousElementSibling
}

describe('MyCoursesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchMyCourses.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [COURSE],
    })
    mocks.fetchCourseEnrollments.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ENROLLMENT],
    })
  })

  it('shows viewed pages without manual editing controls', async () => {
    mocks.fetchCourseEnrollments.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          ...ENROLLMENT,
          progress: 60,
          pages_viewed: 3,
        },
      ],
    })

    renderPage()

    expect(await screen.findByText('My course')).toBeInTheDocument()
    expect(statValue('In progress')).toHaveTextContent('1')
    expect(statValue('Completed')).toHaveTextContent('0')
    expect(screen.getByText('3 of 5 pages viewed')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('counts a fresh enrollment as in progress', async () => {
    renderPage()

    expect(await screen.findByText('My course')).toBeInTheDocument()
    expect(statValue('In progress')).toHaveTextContent('1')
    expect(statValue('Completed')).toHaveTextContent('0')
    expect(screen.getByText('0 of 5 pages viewed')).toBeInTheDocument()
  })

  it('shows the completed state calculated by the backend', async () => {
    mocks.fetchCourseEnrollments.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          ...ENROLLMENT,
          progress: 100,
          completed: true,
          completed_at: '2026-10-25T10:00:00Z',
          pages_viewed: 5,
        },
      ],
    })

    renderPage()

    expect(await screen.findByText('My course')).toBeInTheDocument()
    expect(statValue('In progress')).toHaveTextContent('0')
    expect(statValue('Completed')).toHaveTextContent('1')
    expect(screen.getByText('Course completed')).toBeInTheDocument()
    expect(screen.getByText('5 of 5 pages viewed')).toBeInTheDocument()
  })
})
