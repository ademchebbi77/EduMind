import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../context/AuthContext'
import DashboardPage from './DashboardPage'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

function renderDashboard(role) {
  useAuth.mockReturnValue({
    user: {
      first_name: 'Thomas',
      full_name: 'Thomas Teacher',
      email: 'teacher@edumind.local',
      role,
    },
    status: 'authenticated',
  })

  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuth.mockReset()
  })

  it('offers course management to teachers', () => {
    renderDashboard('teacher')

    expect(screen.getByRole('heading', { name: 'Hello, Thomas.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /publish a course/i })).toHaveAttribute(
      'href',
      '/courses/new',
    )
    expect(screen.getByText('Teacher')).toBeInTheDocument()
  })

  it('keeps course creation hidden from students', () => {
    renderDashboard('student')

    expect(screen.queryByRole('link', { name: /publish a course/i })).toBeNull()
    expect(screen.getByText(/browse courses and download/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore courses/i })).toHaveAttribute(
      'href',
      '/courses',
    )
  })

  it('describes full access for administrators', () => {
    renderDashboard('admin')

    expect(screen.getByRole('link', { name: /publish a course/i })).toBeInTheDocument()
    expect(screen.getByText(/full permissions/i)).toBeInTheDocument()
  })
})
