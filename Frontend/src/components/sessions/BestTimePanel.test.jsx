import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BestTimePanel } from './BestTimePanel'

const slots = [
  {
    weekday: 1,
    weekday_label: 'Mardi',
    hour: 18,
    average_enrollments: 5.5,
    session_count: 4,
    score: 92,
    confidence: 'high',
    confidence_label: 'Élevée',
  },
  {
    weekday: 3,
    weekday_label: 'Jeudi',
    hour: 10,
    average_enrollments: 2,
    session_count: 1,
    score: 40,
    confidence: 'low',
    confidence_label: 'Faible',
  },
]

describe('BestTimePanel', () => {
  it('lists the suggested slots with their confidence', () => {
    render(<BestTimePanel slots={slots} />)

    expect(screen.getByText('Mardi à 18:00')).toBeInTheDocument()
    expect(screen.getByText('5.5 inscrit(s) en moyenne · 4 session(s)')).toBeInTheDocument()
    expect(screen.getByText('Élevée')).toBeInTheDocument()
  })

  it('applies a slot when the teacher clicks "Utiliser"', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<BestTimePanel slots={slots} onSelect={onSelect} />)

    await user.click(screen.getAllByRole('button', { name: /utiliser/i })[0])

    expect(onSelect).toHaveBeenCalledWith(slots[0])
  })

  it('renders nothing without slots', () => {
    const { container } = render(<BestTimePanel slots={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
