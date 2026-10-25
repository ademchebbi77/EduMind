import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAtRiskStudents } from '../../api/users'
import AtRiskStudentsPage from './AtRiskStudentsPage'

vi.mock('../../api/users', () => ({ fetchAtRiskStudents: vi.fn() }))

const payload = {
  count: 2,
  summary: { high: 1, medium: 1, low: 0 },
  results: [
    {
      student_id: 1,
      full_name: 'Lina Démo',
      email: 'lina@example.com',
      score: 78,
      level: 'high',
      label: 'Élevé',
      reasons: ['Moyenne aux quiz faible (35 %)', 'Aucune activité depuis 45 jours'],
      quiz_average: 35,
      quiz_attempts: 2,
      failed_attempts: 2,
      days_inactive: 45,
      overdue_exercises: 1,
    },
    {
      student_id: 2,
      full_name: 'Adam Démo',
      email: 'adam@example.com',
      score: 42,
      level: 'medium',
      label: 'Moyen',
      reasons: ['Exercice en retard'],
      quiz_average: 55,
      quiz_attempts: 2,
      failed_attempts: 1,
      days_inactive: 4,
      overdue_exercises: 1,
    },
  ],
}

describe('AtRiskStudentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchAtRiskStudents.mockResolvedValue(payload)
  })

  it('lists students with their score and reasons', async () => {
    render(<AtRiskStudentsPage />)

    expect(await screen.findByText('Lina Démo')).toBeInTheDocument()
    expect(screen.getByText('78')).toBeInTheDocument()
    expect(screen.getByText('Moyenne aux quiz faible (35 %)')).toBeInTheDocument()
    expect(screen.getAllByText('Élevé').length).toBeGreaterThan(0)
  })

  it('requests a single level when filtering', async () => {
    const user = userEvent.setup()
    render(<AtRiskStudentsPage />)

    await screen.findByText('Lina Démo')
    await user.selectOptions(screen.getByLabelText('Niveau de risque'), 'medium')

    expect(fetchAtRiskStudents).toHaveBeenLastCalledWith(
      { level: 'medium' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('shows an error state when the API fails', async () => {
    fetchAtRiskStudents.mockRejectedValue(new Error('réseau'))

    render(<AtRiskStudentsPage />)

    expect(
      await screen.findByText('Impossible de calculer les risques'),
    ).toBeInTheDocument()
  })
})
