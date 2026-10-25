import { describe, expect, it } from 'vitest'
import { urgencyBadge } from './urgency'

describe('urgencyBadge', () => {
  it('maps high urgency to a visible badge with its reasons', () => {
    expect(
      urgencyBadge({ level: 'high', score: 80, reasons: ['Événement imminent', 'Annonce récente'] }),
    ).toEqual({
      variant: 'warning',
      label: 'Urgent',
      title: 'Événement imminent · Annonce récente',
    })
  })

  it('labels medium urgency as a priority', () => {
    expect(urgencyBadge({ level: 'medium', score: 40, reasons: [] })).toEqual({
      variant: 'brand',
      label: 'Prioritaire',
      title: undefined,
    })
  })

  it('hides low and missing urgency', () => {
    expect(urgencyBadge({ level: 'low', score: 10, reasons: [] })).toBeNull()
    expect(urgencyBadge(undefined)).toBeNull()
  })
})
