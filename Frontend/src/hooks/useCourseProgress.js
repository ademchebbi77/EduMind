import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCourseProgress, updateCourseProgress } from '../api/courses'
import { isCanceled, normalizeApiError } from '../lib/api'

const REPORT_INTERVAL_MS = 5000
const MAX_TIME_UPDATE_DELTA = 2

function seededPages(payload) {
  const count = Math.min(
    payload.pages_viewed ?? 0,
    payload.total_pages ?? 0,
  )
  return new Set(Array.from({ length: count }, (_, index) => index + 1))
}

export function useCourseProgress(course, { enabled = false } = {}) {
  const courseId = course?.id
  const isExternalVideo = Boolean(
    course &&
      course.type === 'video' &&
      course.has_file === false &&
      course.video_url,
  )

  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [rawPage, setRawPage] = useState(1)

  const watchedRef = useRef(0)
  const baselineWatchedRef = useRef(0)
  const seenSecondsRef = useRef(new Set())
  const durationRef = useRef(0)
  const positionRef = useRef(0)
  const totalPagesRef = useRef(0)
  const viewedPagesRef = useRef(new Set())
  const lastTimeRef = useRef(null)
  const lastSentRef = useRef(0)
  const requestSeqRef = useRef(0)
  const lastAppliedSeqRef = useRef(0)
  const pageSeededRef = useRef(null)

  const data = result.key === courseId ? result.data : null
  const error = result.key === courseId ? result.error : null
  const totalPages = data?.total_pages ?? 0
  const page = totalPages ? Math.min(rawPage, totalPages) : rawPage

  const seed = useCallback((payload) => {
    durationRef.current = payload.video_duration_seconds ?? 0
    baselineWatchedRef.current = payload.video_watched_seconds ?? 0
    watchedRef.current = baselineWatchedRef.current
    seenSecondsRef.current = new Set()
    positionRef.current = payload.last_position_seconds ?? 0
    totalPagesRef.current = payload.total_pages ?? 0
    viewedPagesRef.current = seededPages(payload)
    lastTimeRef.current = null
  }, [])

  const sendProgress = useCallback(
    async (overrides = {}) => {
      if (!enabled || !courseId) return null

      const seq = requestSeqRef.current + 1
      requestSeqRef.current = seq

      try {
        const response = await updateCourseProgress(courseId, {
          has_opened_material: true,
          video_duration_seconds: Math.round(durationRef.current),
          video_watched_seconds: Math.round(watchedRef.current),
          last_position_seconds: Math.round(positionRef.current),
          total_pages: totalPagesRef.current,
          pages_viewed: viewedPagesRef.current.size,
          ...overrides,
        })

        if (seq >= lastAppliedSeqRef.current) {
          lastAppliedSeqRef.current = seq
          durationRef.current = Math.max(
            durationRef.current,
            response.video_duration_seconds ?? 0,
          )
          watchedRef.current = Math.max(
            watchedRef.current,
            response.video_watched_seconds ?? 0,
          )
          totalPagesRef.current = Math.max(
            totalPagesRef.current,
            response.total_pages ?? 0,
          )
          setResult({ key: courseId, data: response, error: null })
        }

        return response
      } catch (requestError) {
        if (isCanceled(requestError)) return null
        if (seq >= lastAppliedSeqRef.current) {
          setResult((current) =>
            current.key === courseId
              ? {
                  ...current,
                  error: normalizeApiError(
                    requestError,
                    'Unable to save your progress.',
                  ),
                }
              : current,
          )
        }
        return null
      }
    },
    [courseId, enabled],
  )

  const report = useCallback(
    (force = false) => {
      const now = Date.now()
      if (!force && now - lastSentRef.current < REPORT_INTERVAL_MS) return
      lastSentRef.current = now
      void sendProgress()
    },
    [sendProgress],
  )

  useEffect(() => {
    if (!enabled || !courseId) return undefined

    const controller = new AbortController()
    const seq = requestSeqRef.current + 1
    requestSeqRef.current = seq

    fetchCourseProgress(courseId, { signal: controller.signal })
      .then((payload) => {
        if (seq < lastAppliedSeqRef.current) return
        lastAppliedSeqRef.current = seq
        seed(payload)
        setResult({ key: courseId, data: payload, error: null })
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        if (seq < lastAppliedSeqRef.current) return
        setResult({
          key: courseId,
          data: null,
          error: normalizeApiError(
            requestError,
            'Unable to load your progress.',
          ),
        })
      })

    return () => controller.abort()
  }, [courseId, enabled, seed])

  useEffect(() => {
    if (!enabled || !courseId || !isExternalVideo || !data) return
    if (data.has_opened_material) return
    report(true)
  }, [courseId, data, enabled, isExternalVideo, report])

  useEffect(() => {
    if (!enabled || !courseId || !data || data.total_pages <= 0) return
    if (pageSeededRef.current === courseId) return
    pageSeededRef.current = courseId
    if (viewedPagesRef.current.has(1)) return
    viewedPagesRef.current.add(1)
    report(true)
  }, [courseId, data, enabled, report])

  const goToPage = useCallback(
    (nextPage) => {
      const limit = totalPagesRef.current
      const target = Math.max(1, limit ? Math.min(nextPage, limit) : nextPage)
      setRawPage(target)

      if (!enabled) return
      const previousCount = viewedPagesRef.current.size
      viewedPagesRef.current.add(target)
      if (viewedPagesRef.current.size !== previousCount) {
        report(true)
      }
    },
    [enabled, report],
  )

  const onLoadedMetadata = useCallback(
    (event) => {
      const media = event.currentTarget
      if (Number.isFinite(media.duration) && media.duration > 0) {
        durationRef.current = Math.max(
          durationRef.current,
          Math.floor(media.duration),
        )
      }

      const resumeAt = positionRef.current
      if (
        durationRef.current > 0 &&
        resumeAt > 0 &&
        resumeAt < durationRef.current - 2
      ) {
        media.currentTime = resumeAt
      }

      lastTimeRef.current = media.currentTime
      positionRef.current = media.currentTime
      report(true)
    },
    [report],
  )

  const onTimeUpdate = useCallback(
    (event) => {
      const media = event.currentTarget
      const current = media.currentTime

      if (lastTimeRef.current !== null) {
        const previous = lastTimeRef.current
        const delta = current - previous
        if (delta > 0 && delta <= MAX_TIME_UPDATE_DELTA) {
          for (
            let second = Math.floor(previous);
            second < Math.floor(current);
            second += 1
          ) {
            seenSecondsRef.current.add(second)
          }
          const limit =
            durationRef.current ||
            (Number.isFinite(media.duration) ? media.duration : 0)
          const watched =
            baselineWatchedRef.current + seenSecondsRef.current.size
          watchedRef.current = limit > 0
            ? Math.max(watchedRef.current, Math.min(limit, watched))
            : Math.max(watchedRef.current, watched)
        }
      }

      lastTimeRef.current = current
      positionRef.current = current
      if (!media.paused) report()
    },
    [report],
  )

  const onPlay = useCallback((event) => {
    lastTimeRef.current = event.currentTarget.currentTime
  }, [])

  const onSeeking = useCallback(() => {
    lastTimeRef.current = null
  }, [])

  const onSeeked = useCallback((event) => {
    lastTimeRef.current = event.currentTarget.currentTime
    positionRef.current = event.currentTarget.currentTime
  }, [])

  const onPause = useCallback(
    (event) => {
      lastTimeRef.current = event.currentTarget.currentTime
      positionRef.current = event.currentTarget.currentTime
      report(true)
    },
    [report],
  )

  const onEnded = useCallback(
    (event) => {
      positionRef.current = event.currentTarget.currentTime
      report(true)
    },
    [report],
  )

  const mediaProps = useMemo(
    () => ({
      onLoadedMetadata,
      onTimeUpdate,
      onPlay,
      onSeeking,
      onSeeked,
      onPause,
      onEnded,
    }),
    [
      onLoadedMetadata,
      onTimeUpdate,
      onPlay,
      onSeeking,
      onSeeked,
      onPause,
      onEnded,
    ],
  )

  return {
    enabled,
    progress: data,
    error,
    loading: enabled && !data && !error,
    mediaProps,
    page,
    totalPages,
    goToPage,
    hasExternalVideo: isExternalVideo,
  }
}
