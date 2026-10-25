import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AnnouncementCard } from './AnnouncementCard'

function makeAnnouncement(urgency) {
  return {
    id: 1,
    title: 'Reprise des cours',
    content: 'Les cours reprennent lundi.',
    target_audience: 'all',
    target_audience_display: 'Tous les utilisateurs',
    author_name: 'Thomas Enseignant',
    event_date: null,
    event_time: null,
    meeting_link: '',
    related_session_title: null,
    is_pinned: false,
    created_at: '2026-10-25T10:00:00Z',
    urgency,
  }
}

function renderCard(announcement) {
  return render(
    <MemoryRouter>
      <AnnouncementCard announcement={announcement} />
    </MemoryRouter>,
  )
}

describe('AnnouncementCard', () => {
  it('shows an urgency badge with its reasons in the tooltip', () => {
    renderCard(
      makeAnnouncement({
        score: 70,
        level: 'high',
        label: 'Élevée',
        reasons: ['Événement imminent', 'Annonce récente'],
      }),
    )

    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(screen.getByTitle('Événement imminent · Annonce récente')).toBeInTheDocument()
  })

  it('keeps low urgency announcements quiet', () => {
    renderCard(makeAnnouncement({ score: 10, level: 'low', label: 'Faible', reasons: [] }))

    expect(screen.queryByText('Urgent')).toBeNull()
    expect(screen.queryByText('Prioritaire')).toBeNull()
    expect(screen.getByRole('link', { name: 'Reprise des cours' })).toHaveAttribute(
      'href',
      '/announcements/1',
    )
  })
})
