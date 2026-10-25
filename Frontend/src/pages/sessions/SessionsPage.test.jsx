import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { ToastProvider } from '../../context/ToastContext'
import { deleteSession, fetchRecommendedSessions, fetchSessions } from '../../api/sessions'
import SessionsPage from './SessionsPage'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api/sessions', () => ({
  fetchSessions: vi.fn(),
  fetchRecommendedSessions: vi.fn(),
  deleteSession: vi.fn(),
}))

const upcoming = {
  id: 1,
  title: 'NLP',
  description: 'Traitement du langage',
  session_type: 'course',
  session_type_display: 'Cours en ligne',
  status: 'scheduled',
  status_display: 'Planifiée',
  starts_at: '2026-10-27T11:35:00Z',
  duration_minutes: 90,
  enrollment_count: 0,
  meeting_link: '',
  created_by: 2,
}

const recommended = {
  ...upcoming,
  id: 2,
  title: 'Deep Learning',
  recommendation_reason: 'Correspond à votre historique de formations',
  match_score: 42,
}

function renderPage(role) {
  useAuth.mockReturnValue({ user: { id: 1, role, first_name: 'Sofia' } })

  return render(
    <MemoryRouter>
      <ToastProvider>
        <SessionsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('SessionsPage recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchSessions.mockResolvedValue({ count: 1, next: null, previous: null, results: [upcoming] })
    fetchRecommendedSessions.mockResolvedValue([recommended])
  })

  it('shows students a recommended section with the reason', async () => {
    renderPage('student')

    expect(await screen.findByRole('heading', { name: 'Recommandé pour vous' })).toBeInTheDocument()
    expect(screen.getByText('Correspond à votre historique de formations')).toBeInTheDocument()
    expect(fetchRecommendedSessions).toHaveBeenCalledWith(
      { limit: 3 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('does not request recommendations for teachers', async () => {
    renderPage('teacher')

    expect(await screen.findByRole('heading', { name: 'Sessions en ligne' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recommandé pour vous' })).toBeNull()
    expect(fetchRecommendedSessions).not.toHaveBeenCalled()
    await waitFor(() => expect(deleteSession).not.toHaveBeenCalled())
  })

  it('keeps the list usable when recommendations fail', async () => {
    fetchRecommendedSessions.mockRejectedValue(new Error('network'))
    renderPage('student')

    expect(
      await screen.findByText('Les recommandations sont momentanément indisponibles.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('NLP').length).toBeGreaterThan(0)
  })
})
