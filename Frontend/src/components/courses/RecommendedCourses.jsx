import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { fetchCourses, fetchRecommendations } from '../../api/courses'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CardSkeleton } from '../ui/Skeleton'
import { CourseCard } from './CourseCard'

export function RecommendedCourses({ refreshKey = 0, onEnrollmentChange }) {
  const [reload, setReload] = useState(0)
  const requestKey = `${refreshKey}:${reload}`
  const [result, setResult] = useState({
    key: null,
    items: [],
    algorithm: '',
    fallback: false,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    fetchRecommendations({ limit: 5 }, { signal: controller.signal })
      .then((payload) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          items: Array.isArray(payload.recommendations)
            ? payload.recommendations
            : [],
          algorithm: payload.algorithm || '',
          fallback: false,
          error: null,
        })
      })
      .catch((requestError) => {
        if (cancelled || isCanceled(requestError)) return

        fetchCourses(
          { ordering: '-enrolled_count', pageSize: 5 },
          { signal: controller.signal },
        )
          .then((payload) => {
            if (cancelled) return
            setResult({
              key: requestKey,
              items: (payload.results || []).map((course) => ({
                ...course,
                confidence: null,
                reason: 'Popular with students.',
              })),
              algorithm: 'popular',
              fallback: true,
              error: null,
            })
          })
          .catch((fallbackError) => {
            if (cancelled || isCanceled(fallbackError)) return
            setResult({
              key: requestKey,
              items: [],
              algorithm: '',
              fallback: false,
              error: normalizeApiError(
                requestError,
                'Unable to load recommendations.',
              ),
            })
          })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [requestKey])

  const loading = result.key !== requestKey
  const items = loading ? [] : result.items
  const error = loading ? null : result.error
  const fallback = result.fallback

  if (!loading && !error && items.length === 0) return null

  return (
    <section
      aria-labelledby="recommended-courses-title"
      aria-busy={loading || undefined}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {fallback ? 'Fallback' : 'For you'}
          </p>
          <h2
            id="recommended-courses-title"
            className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink"
          >
            {fallback ? 'Popular courses' : 'Recommended for you'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {fallback
              ? 'Personalized picks are unavailable right now — showing what other students are taking.'
              : 'Personalized from your enrollments and the content of courses you are taking.'}
          </p>
        </div>

        {!loading && items.length ? (
          <Badge variant={fallback ? 'neutral' : 'brand'} dot>
            {fallback || result.algorithm === 'popular'
              ? 'Popular'
              : result.algorithm === 'hybrid'
                ? 'Hybrid ML'
                : 'Personalized'}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-hidden="true"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay"
        >
          <span>{error.message}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReload((current) => current + 1)}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : null}

      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onEnrollmentChange={onEnrollmentChange}
              recommendation={{
                confidence: course.confidence,
                reason: course.reason,
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
