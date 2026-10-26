import { useCallback, useEffect, useRef, useState } from 'react'

// Formats the Whisper API accepts, in order of preference for each browser.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export function pickRecorderMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || ''
}

export function extensionForMimeType(mimeType = '') {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  return 'webm'
}

export function recordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

function microphoneError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied. Allow it in your browser settings, or upload an audio file instead.'
    case 'NotFoundError':
      return 'No microphone was found. Connect one, or upload an audio file instead.'
    case 'NotReadableError':
      return 'The microphone is being used by another application.'
    default:
      return 'Recording could not start. Upload an audio file instead.'
  }
}

/** Record audio from the microphone with MediaRecorder (no external library). */
export function useAudioRecorder({ maxSeconds = 180 } = {}) {
  const [state, setState] = useState({ status: 'idle', blob: null, url: null, mimeType: '', error: '' })
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const urlRef = useRef(null)

  const releaseStream = useCallback(() => {
    window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const reset = useCallback(() => {
    stop()
    releaseStream()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setElapsed(0)
    setState({ status: 'idle', blob: null, url: null, mimeType: '', error: '' })
  }, [stop, releaseStream])

  const start = useCallback(async () => {
    if (!recordingSupported()) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: 'This browser cannot record audio. Upload an audio file instead.',
      }))
      return
    }
    reset()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        releaseStream()
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type })
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setState({ status: 'recorded', blob, url, mimeType: type, error: '' })
      }
      recorderRef.current = recorder
      recorder.start(250)
      const startedAt = Date.now()
      setElapsed(0)
      setState({ status: 'recording', blob: null, url: null, mimeType, error: '' })
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000)
        setElapsed(seconds)
        if (seconds >= maxSeconds) recorder.stop()
      }, 250)
    } catch (error) {
      releaseStream()
      setState({ status: 'error', blob: null, url: null, mimeType: '', error: microphoneError(error) })
    }
  }, [maxSeconds, releaseStream, reset])

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  return { ...state, elapsed, start, stop, reset }
}
