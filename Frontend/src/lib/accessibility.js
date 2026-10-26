/**
 * Accessibility preferences, applied as attributes on <html> so plain CSS can
 * adapt every page of the app (see index.css). Stored in the browser so they
 * also apply on the sign-in page, before any account is known.
 */

export const STORAGE_KEY = 'edumind:accessibility'

export const TEXT_SIZES = [
  { value: 'default', label: 'Default', scale: '100%' },
  { value: 'large', label: 'Large', scale: '112.5%' },
  { value: 'x-large', label: 'Extra large', scale: '125%' },
]

export const DEFAULT_PREFERENCES = {
  textSize: 'default',
  highContrast: false,
}

export function sanitizePreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  const textSize = TEXT_SIZES.some((size) => size.value === source.textSize)
    ? source.textSize
    : DEFAULT_PREFERENCES.textSize
  return {
    textSize,
    highContrast: source.highContrast === true,
  }
}

export function loadPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return sanitizePreferences(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Storage unavailable (private mode): settings still apply for this visit.
  }
}

export function applyPreferences(preferences, root = document.documentElement) {
  root.dataset.textSize = preferences.textSize
  if (preferences.highContrast) root.dataset.contrast = 'high'
  else delete root.dataset.contrast
}

export function isCustomized(preferences) {
  return Object.keys(DEFAULT_PREFERENCES).some(
    (key) => preferences[key] !== DEFAULT_PREFERENCES[key],
  )
}
