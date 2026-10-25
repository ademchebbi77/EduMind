import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Headphones,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { VideoPlayer } from './VideoPlayer'

function PdfPreview({ course, tracking }) {
  const totalPages = tracking?.totalPages ?? 0
  const page = tracking?.page ?? 1
  const tracked = Boolean(tracking?.enabled)
  const src = tracked
    ? `${course.file_url}#page=${page}&toolbar=0&navpanes=0`
    : course.file_url

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Document preview</p>
          <p className="text-xs text-slate-500">
            {tracked
              ? 'Use the page controls below to follow your reading progress.'
              : 'If the preview does not load, open the PDF in a new tab.'}
          </p>
        </div>
      </div>

      {tracked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => tracking.goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <p className="text-sm font-medium text-ink-soft" aria-live="polite">
              Page {page}
              {totalPages ? ` of ${totalPages}` : ''}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => tracking.goToPage(page + 1)}
              disabled={!totalPages || page >= totalPages}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {totalPages ? (
            <p className="text-xs text-slate-500">
              {tracking.progress?.pages_viewed ?? 0}{' '}
              {(tracking.progress?.pages_viewed ?? 0) === 1 ? 'page' : 'pages'}{' '}
              viewed
            </p>
          ) : null}
        </div>
      ) : null}

      <iframe
        src={src}
        title={`PDF preview: ${course.title}`}
        className="h-[65vh] min-h-80 w-full rounded-xl border border-line bg-mist"
      />

      <a
        href={course.file_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Open PDF in a new tab
      </a>
    </div>
  )
}

export function CourseMedia({ course, tracking }) {
  const isAudio = course.type === 'audio'
  const mediaProps = tracking?.mediaProps

  if (course.type === 'video') {
    return <VideoPlayer course={course} mediaProps={mediaProps} />
  }

  if (isAudio) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-sage/10 text-sage ring-1 ring-inset ring-sage/15">
            <Headphones className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Course audio</p>
            <p className="text-xs text-slate-500">
              Playback progress is tracked automatically.
            </p>
          </div>
        </div>
        {/* Uploaded audio has no caption track; the direct file link remains available. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          controls
          preload="metadata"
          src={course.file_url}
          aria-label={`Audio track: ${course.title}`}
          className="w-full"
          {...mediaProps}
        >
          Your browser does not support audio playback.
        </audio>
        <a
          href={course.file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open audio in a new tab
        </a>
      </div>
    )
  }

  if (course.type === 'pdf') {
    return <PdfPreview course={course} tracking={tracking} />
  }

  return (
    <p className="text-sm text-slate-600">
      This format has no built-in preview. Download the file to view it.
    </p>
  )
}
