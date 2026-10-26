import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonTranscript } from './LessonTranscript'

const mocks = vi.hoisted(() => ({
  fetchLessonTranscript: vi.fn(),
  generateLessonTranscript: vi.fn(),
}))

vi.mock('../../api/courses', () => ({
  fetchLessonTranscript: mocks.fetchLessonTranscript,
  generateLessonTranscript: mocks.generateLessonTranscript,
}))

const VIDEO_LESSON = {
  id: 4,
  title: 'Variables',
  file_url: '/api/courses/1/lessons/4/file/',
  file_type: 'video',
  video_url: '',
}

const AUDIO_LESSON = {
  ...VIDEO_LESSON,
  id: 5,
  title: 'Podcast',
  file_type: 'audio',
}

const PDF_LESSON = {
  ...VIDEO_LESSON,
  id: 6,
  title: 'Notes',
  file_type: 'pdf',
}

const EMPTY = {
  status: 'none',
  status_display: 'Not generated',
  stage: '',
  stage_display: '',
  progress: 0,
  language: '',
  model_name: '',
  text: '',
  formatted_by_ai: false,
  segment_count: 0,
  error_message: '',
  started_at: null,
  completed_at: null,
  updated_at: null,
}

const QUEUED = {
  ...EMPTY,
  status: 'queued',
  status_display: 'Queued',
  stage: 'queued',
  stage_display: 'Queued',
  language: 'en',
}

const PROCESSING = {
  ...QUEUED,
  status: 'processing',
  status_display: 'Processing',
  stage: 'transcribing',
  stage_display: 'Transcribing audio',
  progress: 40,
}

const COMPLETED = {
  ...QUEUED,
  status: 'completed',
  status_display: 'Completed',
  stage: 'done',
  stage_display: 'Complete',
  progress: 100,
  text:
    '[00:15] In this lesson, we will learn about variables.\n\n' +
    '[01:05] Then we will practice.',
  formatted_by_ai: true,
  segment_count: 2,
  completed_at: '2026-10-26T10:00:00Z',
}

const FAILED = {
  ...QUEUED,
  status: 'failed',
  status_display: 'Failed',
  stage: 'failed',
  stage_display: 'Failed',
  error_message: 'No speech was detected in this recording.',
}

function apiError(message) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: {
      status: 400,
      data: { error: { code: 'api_error', message } },
    },
  })
}

function renderTranscript(lesson = VIDEO_LESSON) {
  return render(<LessonTranscript courseId="1" lesson={lesson} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LessonTranscript', () => {
  it('offers a Transcript button for uploaded audio and video lessons', () => {
    const video = renderTranscript(VIDEO_LESSON)
    expect(
      screen.getByRole('button', { name: 'Transcript' }),
    ).toBeInTheDocument()
    video.unmount()

    renderTranscript(AUDIO_LESSON)
    expect(
      screen.getByRole('button', { name: 'Transcript' }),
    ).toBeInTheDocument()
  })

  it('stays hidden for PDF and external-only lessons', () => {
    const pdf = renderTranscript(PDF_LESSON)
    expect(screen.queryByRole('button', { name: 'Transcript' })).toBeNull()
    pdf.unmount()

    renderTranscript({ ...VIDEO_LESSON, file_url: null })
    expect(screen.queryByRole('button', { name: 'Transcript' })).toBeNull()
  })

  it('shows a cached transcript without generating it again', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript.mockResolvedValue(COMPLETED)
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(
      await screen.findByText(
        'In this lesson, we will learn about variables.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('00:15')).toBeInTheDocument()
    expect(screen.getByText('01:05')).toBeInTheDocument()
    expect(screen.getByText('AI formatted')).toBeInTheDocument()
    expect(mocks.fetchLessonTranscript).toHaveBeenCalledWith('1', 4)
    expect(mocks.generateLessonTranscript).not.toHaveBeenCalled()
  })

  it('generates a transcript when none exists', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript.mockResolvedValue(EMPTY)
    mocks.generateLessonTranscript.mockResolvedValue(QUEUED)
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(
      await screen.findByText('Waiting to start…'),
    ).toBeInTheDocument()
    expect(mocks.generateLessonTranscript).toHaveBeenCalledWith('1', 4, {
      language: 'en',
    })
    expect(
      screen.getByRole('progressbar', {
        name: 'Lesson transcript generation progress',
      }),
    ).toHaveAttribute('aria-valuenow', '0')
  })

  it('polls the transcript until it is ready', async () => {
    vi.useFakeTimers()
    try {
      mocks.fetchLessonTranscript
        .mockResolvedValueOnce(EMPTY)
        .mockResolvedValueOnce(PROCESSING)
        .mockResolvedValueOnce(COMPLETED)
      mocks.generateLessonTranscript.mockResolvedValue(QUEUED)
      renderTranscript()

      fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getByText('Waiting to start…')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.getByText('Transcribing the audio…')).toBeInTheDocument()
      expect(
        screen.getByRole('progressbar', {
          name: 'Lesson transcript generation progress',
        }),
      ).toHaveAttribute('aria-valuenow', '40')

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })
      expect(
        screen.getByText('In this lesson, we will learn about variables.'),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('regenerates the transcript in a different language', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript.mockResolvedValue(COMPLETED)
    mocks.generateLessonTranscript.mockResolvedValue({
      ...QUEUED,
      language: 'fr',
    })
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))
    await screen.findByText('In this lesson, we will learn about variables.')

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Transcript language' }),
      'fr',
    )
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    expect(mocks.generateLessonTranscript).toHaveBeenCalledWith('1', 4, {
      language: 'fr',
      regenerate: true,
    })
    expect(
      await screen.findByText('Waiting to start…'),
    ).toBeInTheDocument()
  })

  it('shows a failed transcript and lets the student retry', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript.mockResolvedValue(FAILED)
    mocks.generateLessonTranscript.mockResolvedValue(QUEUED)
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(
      await screen.findByText('No speech was detected in this recording.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.generateLessonTranscript).toHaveBeenCalledWith('1', 4, {
      language: 'en',
    })
  })

  it('surfaces load errors and retries', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript
      .mockRejectedValueOnce(apiError('Transcripts are offline.'))
      .mockResolvedValueOnce(COMPLETED)
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(
      await screen.findByText('Unable to load the transcript'),
    ).toBeInTheDocument()
    expect(screen.getByText('Transcripts are offline.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByText(
        'In this lesson, we will learn about variables.',
      ),
    ).toBeInTheDocument()
  })

  it('surfaces generation errors', async () => {
    const user = userEvent.setup()
    mocks.fetchLessonTranscript.mockResolvedValue(EMPTY)
    mocks.generateLessonTranscript.mockRejectedValue(
      apiError('Cohere is receiving too many requests.'),
    )
    renderTranscript()

    await user.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(
      await screen.findByText('Cohere is receiving too many requests.'),
    ).toBeInTheDocument()
  })
})
