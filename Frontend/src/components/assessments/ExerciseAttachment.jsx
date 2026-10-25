import { Download, ExternalLink, FileText, Headphones } from 'lucide-react'
import { buttonClasses } from '../ui/buttonStyles'

export function ExerciseAttachment({ exercise }) {
  const isAudio = exercise.attachment_type === 'audio'
  const Icon = isAudio ? Headphones : FileText
  const name = exercise.attachment_name || (isAudio ? 'Audio file' : 'Document')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
              isAudio
                ? 'bg-sage/10 text-sage ring-sage/15'
                : 'bg-brand/10 text-brand-strong ring-brand/15'
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="text-xs text-slate-500">
              {isAudio ? 'Audio attachment' : 'If the preview does not load, open the file in a new tab.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={exercise.attachment_url}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open
          </a>
          <a
            href={exercise.attachment_download_url}
            download
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        </div>
      </div>

      {isAudio ? (
        <>
          {/* Uploaded audio has no caption track; the direct file link remains available. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            preload="metadata"
            src={exercise.attachment_url}
            aria-label={`Audio attachment: ${name}`}
            className="w-full"
          >
            Your browser does not support audio playback.
          </audio>
        </>
      ) : (
        <iframe
          src={exercise.attachment_url}
          title={`PDF preview: ${name}`}
          className="h-[60vh] min-h-80 w-full rounded-xl border border-line bg-mist"
        />
      )}
    </div>
  )
}
