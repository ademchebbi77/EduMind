import { ExternalLink } from 'lucide-react'

function videoEmbedUrl(value) {
  if (!value) return null

  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id =
        parsed.searchParams.get('v') ||
        parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = parsed.pathname.match(/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }

    return null
  } catch {
    return null
  }
}

export function VideoPlayer({ course, mediaProps }) {
  if (!course) return null

  const embedUrl = videoEmbedUrl(course.video_url)

  if (embedUrl) {
    return (
      <div className="space-y-3">
        <div className="aspect-video overflow-hidden rounded-xl border border-line bg-ink">
          <iframe
            src={embedUrl}
            title={`Video: ${course.title}`}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <a
          href={course.video_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open video in a new tab
        </a>
      </div>
    )
  }

  if (course.type === 'video' && course.has_file !== false) {
    return (
      <div className="space-y-3">
        {/* Uploaded videos have no caption track; the direct file link remains available. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          controls
          preload="metadata"
          src={course.file_url}
          aria-label={`Video: ${course.title}`}
          className="w-full rounded-xl border border-line bg-ink"
          {...mediaProps}
        >
          Your browser does not support video playback.
        </video>
        <a
          href={course.file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open video in a new tab
        </a>
      </div>
    )
  }

  return (
    <p className="text-sm text-slate-600">
      This course does not have a playable video resource yet.
    </p>
  )
}
