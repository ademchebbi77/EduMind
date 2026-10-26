import { useEffect, useMemo, useRef, useState } from 'react'
import { Headphones, Pause, Play, Square } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { plainText, splitIntoChunks } from '../../lib/summaries'

// Text-to-speech with the browser's Web Speech API (free, nothing is sent to a server).
const VOICE_LANG = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA' }
const SPEEDS = [0.75, 1, 1.25, 1.5]

export function AudioPlayer({ text, language = 'en' }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const chunks = useMemo(() => splitIntoChunks(plainText(text)), [text])
  const [status, setStatus] = useState('stopped') // stopped | playing | paused
  const [current, setCurrent] = useState(0)
  const [rate, setRate] = useState(1)
  // Each new reading gets a number, so events of a cancelled reading are ignored.
  const session = useRef(0)

  // Stop reading when the user leaves the page.
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  function speakFrom(index, speed) {
    const synth = window.speechSynthesis
    session.current += 1
    const mySession = session.current
    synth.cancel()

    const lang = VOICE_LANG[language] || 'en-US'
    const voice = synth.getVoices().find((item) => item.lang.replace('_', '-').startsWith(lang.slice(0, 2)))
    chunks.slice(index).forEach((chunk, offset) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = lang
      utterance.rate = speed
      if (voice) utterance.voice = voice
      utterance.onstart = () => mySession === session.current && setCurrent(index + offset)
      if (index + offset === chunks.length - 1) {
        utterance.onend = () => {
          if (mySession !== session.current) return
          setStatus('stopped')
          setCurrent(0)
        }
      }
      synth.speak(utterance)
    })
    setCurrent(index)
    setStatus('playing')
  }

  function togglePlay() {
    if (status === 'playing') {
      window.speechSynthesis.pause()
      setStatus('paused')
    } else if (status === 'paused') {
      window.speechSynthesis.resume()
      setStatus('playing')
    } else {
      speakFrom(0, rate)
    }
  }

  function stop() {
    session.current += 1
    window.speechSynthesis.cancel()
    setStatus('stopped')
    setCurrent(0)
  }

  function changeSpeed(speed) {
    setRate(speed)
    if (status !== 'stopped') speakFrom(current, speed) // continue at the new speed
  }

  const progress = status === 'stopped' || !chunks.length ? 0 : ((current + 1) / chunks.length) * 100

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand-strong">
          <Headphones className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-ink">Listen to the summary</h2>
          <p className="text-xs text-slate-600">
            {supported ? 'Read aloud by your browser, like a mini-podcast.' : 'Your browser cannot read text aloud.'}
          </p>
        </div>
      </div>

      {supported && chunks.length ? (
        <div className="flex flex-1 flex-wrap items-center gap-3 sm:justify-end">
          <Button variant="accent" size="sm" onClick={togglePlay}>
            {status === 'playing' ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}
          </Button>
          <Button variant="secondary" size="sm" onClick={stop} disabled={status === 'stopped'} aria-label="Stop">
            <Square className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-32 flex-1 sm:max-w-56">
            <div
              role="progressbar"
              aria-label="Reading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-2 overflow-hidden rounded-full bg-mist"
            >
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {status === 'stopped' ? `${chunks.length} parts` : `Part ${current + 1} of ${chunks.length}`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
            Speed
            <select
              value={rate}
              onChange={(event) => changeSpeed(Number(event.target.value))}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </Card>
  )
}
