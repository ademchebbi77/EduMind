import { FileText, Headphones, ExternalLink } from 'lucide-react'

export function CourseMedia({ course }) {
  const isAudio = course.type === 'audio'

  if (isAudio) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-sage/10 text-sage ring-1 ring-inset ring-sage/15">
            <Headphones className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Course audio</p>
            <p className="text-xs text-slate-500">Track navigation available.</p>
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
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Document preview</p>
            <p className="text-xs text-slate-500">
              If the preview does not load, open the PDF in a new tab.
            </p>
          </div>
        </div>
        <iframe
          src={course.file_url}
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

  return (
    <p className="text-sm text-slate-600">
      This format has no built-in preview. Download the file to view it.
    </p>
  )
}
