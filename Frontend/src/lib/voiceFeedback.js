/** Reasons a student can give when an AI answer did not help (same values as the API). */
export const RATING_REASONS = [
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'wrong', label: 'Wrong' },
  { value: 'too_complex', label: 'Too complex' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'other', label: 'Other' },
]

export function reasonLabel(value) {
  return RATING_REASONS.find((reason) => reason.value === value)?.label || value
}
