import { useCallback, useEffect, useState } from 'react'
import { fetchAppConfig } from '../api/auth'
import { normalizeApiError } from '../lib/api'

export function useAppConfig() {
  const [state, setState] = useState({
    config: null,
    loading: true,
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    fetchAppConfig()
      .then((config) => {
        if (active) setState({ config, loading: false, error: null })
      })
      .catch((error) => {
        if (!active) return
        setState({
          config: null,
          loading: false,
          error: normalizeApiError(
            error,
            'Unable to load the file upload rules.',
          ),
        })
      })

    return () => {
      active = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    setAttempt((current) => current + 1)
  }, [])

  return {
    ...state,
    retry,
  }
}
