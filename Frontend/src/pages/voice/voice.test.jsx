import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import VoiceQuestionsPage from './VoiceQuestionsPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchVoiceConfig: vi.fn(),
  fetchVoiceQuestions: vi.fn(),
  fetchVoiceQuestion: vi.fn(),
  createVoiceQuestion: vi.fn(),
  askVoiceQuestion: vi.fn(),
  retryVoiceQuestion: vi.fn(),
  deleteVoiceQuestion: vi.fn(),
  fetchCourseOptions: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ addToast: mocks.addToast }) }))
vi.mock('../../api/voiceQuestions', () => mocks)
vi.mock('../../api/assessments', () => ({ fetchCourseOptions: mocks.fetchCourseOptions }))

const STUDENT = { id: 9, first_name: 'Sofia', role: 'student' }
const CONFIG = {
  enabled: true,
  transcription_enabled: true,
  answers_enabled: true,
  max_audio_mb: 25,
  max_audio_bytes: 25 * 1024 * 1024,
  max_recording_seconds: 180,
  audio_extensions: ['webm', 'ogg', 'mp3', 'wav', 'm4a'],
  languages: [
    { value: 'auto', label: 'Automatic' },
    { value: 'fr', label: 'French' },
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'Arabic' },
  ],
}

const BASE = {
  id: 'q-1',
  course: 1,
  course_title: 'Neural networks',
  audio_url: '/api/voice-questions/q-1/audio/',
  audio_name: 'question.webm',
  language_hint: 'auto',
  transcript: '',
  detected_language: '',
  question_text: '',
  answer: '',
  answer_language: '',
  context_source: '',
  failed_stage: '',
  error_message: '',
  answer_ms: null,
  created_at: '2026-10-26T10:00:00Z',
  answered_at: null,
}
const TRANSCRIBING = { ...BASE, status: 'transcribing' }
const TRANSCRIBED = {
  ...BASE,
  status: 'transcribed',
  transcript: 'What is the learning rate?',
  question_text: 'What is the learning rate?',
  detected_language: 'en',
}
const ANSWERED = {
  ...TRANSCRIBED,
  status: 'answered',
  question_text: 'What does the learning rate control?',
  answer: 'Sofia, the learning rate controls the size of each update.',
  answer_language: 'en',
  context_source: 'course document',
  answer_ms: 1840,
  answered_at: '2026-10-26T10:00:05Z',
}

function renderPage(entry = '/voice-questions') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/voice-questions" element={<VoiceQuestionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

class FakeMediaRecorder {
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus'
  }

  constructor(stream, options) {
    this.stream = stream
    this.mimeType = options?.mimeType || ''
    this.state = 'inactive'
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: STUDENT, status: 'authenticated' })
  mocks.fetchVoiceConfig.mockResolvedValue(CONFIG)
  mocks.fetchVoiceQuestions.mockResolvedValue({ count: 0, results: [] })
  mocks.fetchCourseOptions.mockResolvedValue([{ id: 1, title: 'Neural networks', owner: 2 }])
})

afterEach(() => {
  delete window.MediaRecorder
  delete navigator.mediaDevices
})

describe('VoiceQuestionsPage', () => {
  it('uploads an audio file, lets the student correct the transcription and shows the answer', async () => {
    const user = userEvent.setup()
    mocks.createVoiceQuestion.mockResolvedValue(TRANSCRIBING)
    mocks.fetchVoiceQuestion.mockResolvedValueOnce(TRANSCRIBED).mockResolvedValue(ANSWERED)
    mocks.askVoiceQuestion.mockResolvedValue({ ...TRANSCRIBED, status: 'answering', question_text: ANSWERED.question_text })
    renderPage()

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.selectOptions(screen.getByLabelText(/language spoken/i), 'en')
    await user.click(screen.getByRole('radio', { name: /upload an audio file/i }))
    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['voice'], 'question.webm', { type: 'audio/webm' }),
    )
    await user.click(screen.getByRole('button', { name: /transcribe my question/i }))

    const formData = mocks.createVoiceQuestion.mock.calls[0][0]
    expect(formData.get('course')).toBe('1')
    expect(formData.get('language')).toBe('en')
    expect(formData.get('audio').name).toBe('question.webm')
    expect(await screen.findByText(/transcribing your question/i)).toBeInTheDocument()

    const transcription = await screen.findByLabelText(/^transcription/i, {}, { timeout: 4000 })
    expect(transcription).toHaveValue('What is the learning rate?')
    expect(screen.getByText('Detected: English')).toBeInTheDocument()
    await user.clear(transcription)
    await user.type(transcription, 'What does the learning rate control?')
    await user.click(screen.getByRole('button', { name: /get the answer/i }))

    expect(mocks.askVoiceQuestion).toHaveBeenCalledWith('q-1', 'What does the learning rate control?')
    const answer = await screen.findByText(/the learning rate controls the size/i, {}, { timeout: 4000 })
    expect(answer).toHaveAttribute('dir', 'auto')
    expect(answer).toHaveAttribute('lang', 'en')
    expect(screen.getByText(/based on the course document · 1.8 s/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /ask another question/i })[0])
    expect(screen.getByRole('button', { name: /transcribe my question/i })).toBeInTheDocument()
  })

  it('records with the microphone and sends the recording', async () => {
    const user = userEvent.setup()
    const stopTrack = vi.fn()
    window.MediaRecorder = FakeMediaRecorder
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
    })
    mocks.createVoiceQuestion.mockResolvedValue(TRANSCRIBED)
    renderPage()

    await user.selectOptions(await screen.findByLabelText(/^course/i), '1')
    await user.click(screen.getByRole('button', { name: /start recording/i }))
    expect(await screen.findByText(/recording…/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stop recording/i }))

    expect(await screen.findByLabelText(/your recorded question/i)).toBeInTheDocument()
    expect(stopTrack).toHaveBeenCalled() // microphone released
    await user.click(screen.getByRole('button', { name: /transcribe my question/i }))

    const audio = mocks.createVoiceQuestion.mock.calls[0][0].get('audio')
    expect(audio.name).toBe('question.webm')
    expect(audio.type).toBe('audio/webm;codecs=opus')
    expect(await screen.findByLabelText(/^transcription/i)).toHaveValue('What is the learning rate?')
  })

  it('explains when the microphone is blocked', async () => {
    const user = userEvent.setup()
    window.MediaRecorder = FakeMediaRecorder
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(denied) },
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /start recording/i }))

    expect(await screen.findByText(/microphone access was denied/i)).toBeInTheDocument()
  })

  it('validates the form before sending', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /transcribe my question/i }))

    expect(screen.getByText('Choose the course your question is about.')).toBeInTheDocument()
    expect(screen.getByText('Record your question first.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /upload an audio file/i }))
    await user.upload(
      screen.getByLabelText(/browse your files/i),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    )
    expect(screen.getByText(/unsupported audio format/i)).toBeInTheDocument()
    expect(mocks.createVoiceQuestion).not.toHaveBeenCalled()
  })

  it('shows failures and retries', async () => {
    const user = userEvent.setup()
    mocks.fetchVoiceQuestion.mockResolvedValue({
      ...TRANSCRIBED,
      status: 'failed',
      failed_stage: 'answer',
      error_message: 'The AI service is busy or its quota is reached. Try again in a moment.',
    })
    mocks.retryVoiceQuestion.mockResolvedValue({ ...ANSWERED })
    renderPage('/voice-questions?q=q-1')

    expect(await screen.findByText(/the answer could not be generated/i)).toBeInTheDocument()
    expect(screen.getByText(/quota is reached/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^retry/i }))

    expect(mocks.retryVoiceQuestion).toHaveBeenCalledWith('q-1')
    expect(await screen.findByText(/the learning rate controls the size/i)).toBeInTheDocument()
  })

  it('opens and deletes questions from the history', async () => {
    const user = userEvent.setup()
    mocks.fetchVoiceQuestions.mockResolvedValue({ count: 1, results: [ANSWERED] })
    mocks.deleteVoiceQuestion.mockResolvedValue()
    renderPage()

    const history = await screen.findByRole('complementary', { name: /my questions/i })
    await user.click(within(history).getByRole('button', { name: /^what does the learning rate control/i }))
    expect(await screen.findByText(/the learning rate controls the size/i)).toBeInTheDocument()

    await user.click(within(history).getByRole('button', { name: /delete the question/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mocks.deleteVoiceQuestion).toHaveBeenCalledWith('q-1'))
    expect(screen.getByRole('button', { name: /transcribe my question/i })).toBeInTheDocument()
  })

  it('tells administrators which keys are missing', async () => {
    useAuth.mockReturnValue({ user: { ...STUDENT, role: 'admin' }, status: 'authenticated' })
    mocks.fetchVoiceConfig.mockResolvedValue({ ...CONFIG, enabled: false, transcription_enabled: false })
    renderPage()

    expect(await screen.findByText(/set OPENAI_API_KEY in the backend \.env/i)).toBeInTheDocument()
  })

  it('does not reveal configuration details to students', async () => {
    mocks.fetchVoiceConfig.mockResolvedValue({ ...CONFIG, enabled: false, answers_enabled: false })
    renderPage()

    expect(await screen.findByText(/contact an administrator/i)).toBeInTheDocument()
    expect(screen.queryByText(/GEMINI_API_KEY/)).not.toBeInTheDocument()
    await act(async () => {})
  })
})
