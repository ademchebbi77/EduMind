import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LessonsEditor from './LessonsEditor'

const mocks = vi.hoisted(() => ({
  fetchLessons: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderLessons: vi.fn(),
  analyzeBulkLessons: vi.fn(),
}))

vi.mock('../../api/courses', () => ({
  fetchLessons: mocks.fetchLessons,
  createLesson: mocks.createLesson,
  updateLesson: mocks.updateLesson,
  deleteLesson: mocks.deleteLesson,
  reorderLessons: mocks.reorderLessons,
  analyzeBulkLessons: mocks.analyzeBulkLessons,
}))

const ANALYSIS = {
  lessons: [
    {
      order: 1,
      title: 'Introduction to Python',
      description: 'This lesson introduces variables and simple programs.',
      duration_minutes: 5,
      file_name: 'intro.pdf',
      file_type: 'pdf',
      difficulty: 'beginner',
      confidence: 0.82,
      warnings: [],
    },
    {
      order: 2,
      title: 'Variables and Data Types',
      description: 'A closer look at numbers, strings and lists.',
      duration_minutes: 12,
      file_name: 'variables.mp4',
      file_type: 'video',
      difficulty: 'intermediate',
      confidence: 0.64,
      warnings: ['The lesson duration could not be estimated.'],
    },
  ],
  processing_time_ms: 1200,
  total_files: 2,
  successful: 2,
  failed: [],
}

function pdfFile(name = 'intro.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

function videoFile(name = 'variables.mp4') {
  return new File(['video'], name, { type: 'video/mp4' })
}

function renderEditor(props) {
  return render(
    <LessonsEditor
      accept=".pdf,.mp4"
      validateFile={() => null}
      {...props}
    />,
  )
}

function bulkInput() {
  return screen.getByLabelText('Bulk lesson files')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchLessons.mockResolvedValue([])
  mocks.analyzeBulkLessons.mockResolvedValue(ANALYSIS)
})

describe('LessonsEditor bulk upload', () => {
  it('opens the file picker from the bulk button', async () => {
    const user = userEvent.setup()
    renderEditor()
    const input = bulkInput()
    const clickSpy = vi.spyOn(input, 'click')

    await user.click(screen.getByRole('button', { name: /bulk upload with ai/i }))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('analyzes the selected files and previews the generated lessons', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), videoFile()])

    const dialog = await screen.findByRole('dialog')
    expect(mocks.analyzeBulkLessons).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'intro.pdf' }),
      expect.objectContaining({ name: 'variables.mp4' }),
    ])
    expect(
      within(dialog).getByRole('heading', { name: /ai generated lessons \(2\)/i }),
    ).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('Introduction to Python')).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('Variables and Data Types')).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('12')).toBeInTheDocument()
    expect(within(dialog).getByText('82% confidence')).toBeInTheDocument()
    expect(within(dialog).getByText('Beginner')).toBeInTheDocument()
    expect(
      within(dialog).getByText('The lesson duration could not be estimated.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('intro.pdf')).toBeInTheDocument()
  })

  it('rejects more than ten files without calling the API', async () => {
    const user = userEvent.setup()
    renderEditor()
    const files = Array.from({ length: 11 }, (_, index) => pdfFile(`lesson_${index}.pdf`))

    await user.upload(bulkInput(), files)

    expect(
      screen.getByText(/upload 1-10 files maximum\. you selected 11\./i),
    ).toBeInTheDocument()
    expect(mocks.analyzeBulkLessons).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rejects unsupported files from the course upload rules', async () => {
    const user = userEvent.setup()
    renderEditor({
      accept: '.pdf',
      validateFile: (file) =>
        file.name === 'huge.pdf' ? 'The file exceeds the maximum size of 50 MB.' : null,
    })

    await user.upload(bulkInput(), [pdfFile(), pdfFile('huge.pdf')])

    expect(screen.getByRole('alert')).toHaveTextContent(
      'huge.pdf: The file exceeds the maximum size of 50 MB.',
    )
    expect(mocks.analyzeBulkLessons).not.toHaveBeenCalled()
  })

  it('shows the API error when the analysis fails', async () => {
    const user = userEvent.setup()
    mocks.analyzeBulkLessons.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          error: {
            code: 'throttled',
            message: 'Bulk lesson analysis is limited to 10 requests per hour.',
            fields: {},
          },
        },
      },
    })
    renderEditor()

    await user.upload(bulkInput(), [pdfFile()])

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /limited to 10 requests per hour/i,
    )
    expect(within(dialog).queryByRole('button', { name: /add all lessons/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('adds the generated lessons to the editor after review', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), videoFile()])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /add all lessons/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const titles = screen.getAllByLabelText(/lesson title/i)
    expect(titles).toHaveLength(2)
    expect(titles[0]).toHaveValue('Introduction to Python')
    expect(titles[1]).toHaveValue('Variables and Data Types')
    expect(screen.getByText('intro.pdf · 8 bytes')).toBeInTheDocument()
    expect(screen.getByText('variables.mp4 · 5 bytes')).toBeInTheDocument()
  })

  it('lets teachers edit titles and durations before adding', async () => {
    const user = userEvent.setup()
    mocks.analyzeBulkLessons.mockResolvedValue({
      ...ANALYSIS,
      lessons: [ANALYSIS.lessons[0]],
      total_files: 1,
      successful: 1,
    })
    renderEditor()

    await user.upload(bulkInput(), [pdfFile()])
    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByDisplayValue('Introduction to Python')
    await user.clear(title)
    await user.type(title, 'Getting started with Python')
    const duration = within(dialog).getByDisplayValue('5')
    await user.clear(duration)
    await user.type(duration, '7')

    await user.click(within(dialog).getByRole('button', { name: /add all lessons/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByLabelText(/lesson title/i)).toHaveValue('Getting started with Python')
    expect(screen.getByLabelText('Duration (min)')).toHaveValue(7)
  })

  it('blocks adding lessons with an empty title', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile()])
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByDisplayValue('Introduction to Python'))

    await user.click(within(dialog).getByRole('button', { name: /add all lessons/i }))

    expect(within(dialog).getByText('Enter a lesson title.')).toBeInTheDocument()
    expect(screen.getByText(/no lessons yet/i)).toBeInTheDocument()
  })

  it('reorders generated lessons', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), videoFile()])
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Move generated lesson 1 down' }),
    )
    await user.click(within(dialog).getByRole('button', { name: /add all lessons/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const titles = screen.getAllByLabelText(/lesson title/i)
    expect(titles[0]).toHaveValue('Variables and Data Types')
    expect(titles[1]).toHaveValue('Introduction to Python')
  })

  it('allows removing a generated lesson', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), videoFile()])
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove generated lesson 2' }),
    )
    await user.click(within(dialog).getByRole('button', { name: /add all lessons/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getAllByLabelText(/lesson title/i)).toHaveLength(1)
    expect(screen.getByLabelText(/lesson title/i)).toHaveValue('Introduction to Python')
  })

  it('cancels without adding lessons', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), videoFile()])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(/no lessons yet/i)).toBeInTheDocument()
  })

  it('reports files that could not be analyzed', async () => {
    const user = userEvent.setup()
    mocks.analyzeBulkLessons.mockResolvedValue({
      ...ANALYSIS,
      lessons: [ANALYSIS.lessons[0]],
      total_files: 2,
      successful: 1,
      failed: [{ file_name: 'broken.pdf', error: 'This PDF could not be read.' }],
    })
    renderEditor()

    await user.upload(bulkInput(), [pdfFile(), pdfFile('broken.pdf')])

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/1 file could not be analyzed/i),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/this pdf could not be read\./i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /add all lessons/i })).toBeEnabled()
  })

  it('prevents adding lessons when every file failed', async () => {
    const user = userEvent.setup()
    mocks.analyzeBulkLessons.mockResolvedValue({
      lessons: [],
      processing_time_ms: 300,
      total_files: 1,
      successful: 0,
      failed: [{ file_name: 'broken.pdf', error: 'This PDF could not be read.' }],
    })
    renderEditor()

    await user.upload(bulkInput(), [pdfFile('broken.pdf')])

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/none of the files produced a lesson/i),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /add all lessons/i })).toBeDisabled()
  })
})
