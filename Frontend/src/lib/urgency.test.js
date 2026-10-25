import { describe, expect, it } from 'vitest'
import { urgencyBadge, urgencyScore } from './urgency'

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

describe('urgencyScore', () => {
  it('formats the numeric score with its reasons as tooltip', () => {
    expect(urgencyScore({ level: 'high', score: 72, reasons: ['Événement imminent'] })).toEqual({
      value: 72,
      text: 'Urgence 72/100',
      title: 'Événement imminent',
    })
  })

  it('keeps the score visible for low urgency', () => {
    expect(urgencyScore({ level: 'low', score: 0, reasons: [] })).toEqual({
      value: 0,
      text: 'Urgence 0/100',
      title: undefined,
    })
  })

  it('returns null when the API does not provide a score', () => {
    expect(urgencyScore(undefined)).toBeNull()
  })
})
