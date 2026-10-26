import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PREFERENCES,
  applyPreferences,
  loadPreferences,
  sanitizePreferences,
  savePreferences,
} from '../lib/accessibility'

const AccessibilityContext = createContext(null)

export function AccessibilityProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferences)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    applyPreferences(preferences)
    savePreferences(preferences)
  }, [preferences])

  const update = useCallback((changes) => {
    setPreferences((current) => sanitizePreferences({ ...current, ...changes }))
  }, [])

  const reset = useCallback(() => setPreferences({ ...DEFAULT_PREFERENCES }), [])
  const openPanel = useCallback(() => setPanelOpen(true), [])
  const closePanel = useCallback(() => setPanelOpen(false), [])

  const value = useMemo(
    () => ({ preferences, update, reset, panelOpen, openPanel, closePanel }),
    [preferences, update, reset, panelOpen, openPanel, closePanel],
  )

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>
}

/** Like useAccessibility, but returns null outside the provider (isolated renders). */
export function useOptionalAccessibility() {
  return useContext(AccessibilityContext)
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider.')
  }
  return context
}
