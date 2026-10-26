import { Mic, RotateCcw, Square } from 'lucide-react'
import { formatCountdown } from '../../lib/assessments'
import { Button } from '../ui/Button'

export function AudioRecorder({ recorder, maxSeconds, disabled = false }) {
  const { status, elapsed, url, error, start, stop, reset } = recorder
  const recording = status === 'recording'
  const remaining = Math.max(0, maxSeconds - elapsed)

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 bg-mist/40 px-4 py-6 text-center">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={disabled}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : status === 'recorded' ? 'Record again' : 'Start recording'}
          className={`inline-flex size-20 items-center justify-center rounded-full text-paper shadow-md transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:opacity-60 ${
            recording ? 'bg-clay hover:bg-[#9a2f12]' : 'bg-brand-strong hover:bg-brand'
          }`}
        >
          {recording ? <Square className="size-7" aria-hidden="true" /> : <Mic className="size-8" aria-hidden="true" />}
        </button>

        <div aria-live="polite">
          {recording ? (
            <p className="text-sm font-semibold text-clay">
              <span className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-clay align-middle" aria-hidden="true" />
              Recording… <span role="timer" className="tabular-nums">{formatCountdown(elapsed)}</span>
              <span className="ml-1 font-normal text-slate-600">({formatCountdown(remaining)} left)</span>
            </p>
          ) : status === 'recorded' ? (
            <p className="text-sm font-semibold text-sage">Recording ready ({formatCountdown(elapsed)}). Listen to it below.</p>
          ) : (
            <p className="text-sm text-slate-600">
              Press the microphone and ask your question out loud (up to {Math.round(maxSeconds / 60)} min).
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-clay">
          {error}
        </p>
      ) : null}

      {status === 'recorded' && url ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4 sm:flex-row sm:items-center">
          {/* Student's own recording: no captions exist, the transcription is shown next. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={url} aria-label="Your recorded question" className="w-full" />
          <Button variant="secondary" size="sm" onClick={reset} disabled={disabled}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Discard
          </Button>
        </div>
      ) : null}
    </div>
  )
}
