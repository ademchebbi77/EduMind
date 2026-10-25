import { useCallback, useEffect, useState } from 'react'
import { fetchCourseOptions } from '../api/assessments'
import { isCanceled, normalizeApiError } from '../lib/api'

/** Loads every existing course for selectors and filters. */
export function useCourseOptions() {
  const [state, setState] = useState({ courses: [], loading: true, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetchCourseOptions({ signal: controller.signal })
      .then((courses) => setState({ courses, loading: false, error: null }))
      .catch((error) => {
        if (isCanceled(error)) return
        setState({
          courses: [],
          loading: false,
          error: normalizeApiError(error, 'Unable to load the courses.'),
        })
      })

    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    setAttempt((current) => current + 1)
  }, [])

  return { ...state, retry }
}
