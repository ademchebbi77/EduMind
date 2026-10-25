import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SessionCard } from './SessionCard'

const session = {
  id: 7,
  title: 'Deep Learning',
  description: 'Réseaux de neurones',
  session_type: 'course',
  session_type_display: 'Cours en ligne',
  status: 'scheduled',
  status_display: 'Planifiée',
  starts_at: '2026-10-30T19:45:00Z',
  duration_minutes: 120,
  enrollment_count: 0,
  meeting_link: '',
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <SessionCard session={session} {...props} />
    </MemoryRouter>,
  )
}

describe('SessionCard', () => {
  it('explains why a session is recommended', () => {
    renderCard({ recommendationReason: 'Correspond à votre historique de formations' })

    expect(screen.getByText('Correspond à votre historique de formations')).toBeInTheDocument()
  })

  it('renders no recommendation note for regular cards', () => {
    renderCard()

    expect(screen.queryByText(/historique de formations/i)).toBeNull()
  })
})
