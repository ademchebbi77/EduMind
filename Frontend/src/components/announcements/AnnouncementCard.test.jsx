import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AnnouncementCard } from './AnnouncementCard'

function makeAnnouncement(urgency, overrides = {}) {
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
    ...overrides,
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
    expect(screen.getByText('Urgence 70/100')).toBeInTheDocument()
    expect(screen.getAllByTitle('Événement imminent · Annonce récente')).toHaveLength(2)
  })

  it('keeps low urgency announcements quiet', () => {
    renderCard(makeAnnouncement({ score: 10, level: 'low', label: 'Faible', reasons: [] }))

    expect(screen.queryByText('Urgent')).toBeNull()
    expect(screen.queryByText('Prioritaire')).toBeNull()
    expect(screen.getByText('Urgence 10/100')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reprise des cours' })).toHaveAttribute(
      'href',
      '/announcements/1',
    )
  })

  it('shows the number of seats for a formation', () => {
    renderCard(
      makeAnnouncement(undefined, { capacity: 20, seats_taken: 3, seats_remaining: 17 }),
    )

    expect(screen.getByText('3 / 20')).toBeInTheDocument()
  })

  it('marks a formation as full', () => {
    renderCard(
      makeAnnouncement(undefined, { capacity: 2, seats_taken: 2, seats_remaining: 0 }),
    )

    expect(screen.getByText('2 / 2 — complet')).toBeInTheDocument()
  })

  it('shows the detected category with its keywords', () => {
    renderCard(
      makeAnnouncement(undefined, {
        category: {
          key: 'formation',
          label: 'Formation',
          confidence: 82,
          keywords: ['formation', 'atelier'],
        },
      }),
    )

    expect(screen.getByText('Formation')).toBeInTheDocument()
    expect(
      screen.getByTitle('Formation · mots-clés : formation, atelier'),
    ).toBeInTheDocument()
  })
})
