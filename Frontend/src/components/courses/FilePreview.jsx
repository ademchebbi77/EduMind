import { ExternalLink, FileText, Headphones, X } from 'lucide-react'
import { formatBytes } from '../../lib/format'

export function FilePreview({
  fileName,
  fileSize,
  kind,
  url,
  onRemove,
  existing = false,
  subtitle,
}) {
  const isAudio = kind === 'audio'
  const Icon = isAudio ? Headphones : FileText

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
            isAudio
              ? 'bg-sage/10 text-sage ring-sage/15'
              : 'bg-brand/10 text-brand-strong ring-brand/15'
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
          <p className="text-xs text-slate-500">
            {subtitle || (existing ? 'Current file' : 'New file')}
            {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
          </p>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove file “${fileName}”`}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-clay/10 hover:text-clay"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {url && isAudio ? (
        <>
          {/* Uploaded audio has no caption track; the direct file link remains available. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            preload="metadata"
            src={url}
            aria-label={`Audio preview: ${fileName}`}
            className="mt-3 w-full"
          />
        </>
      ) : null}

      {url && !isAudio ? (
        <iframe
          src={url}
          title={`PDF preview: ${fileName}`}
          className="mt-3 h-52 w-full rounded-xl border border-line bg-mist"
        />
      ) : null}

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open in a new tab
        </a>
      ) : null}
    </div>
  )
}
