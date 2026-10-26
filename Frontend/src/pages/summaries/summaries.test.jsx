import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSummary, plainText, splitIntoChunks, validateResource, validateSummary } from '../../lib/summaries'
import { AudioPlayer } from '../../components/summaries/AudioPlayer'
import ResourceFormPage from './ResourceFormPage'
import SummariesPage from './SummariesPage'
import SummaryDetailPage from './SummaryDetailPage'
import SummaryFormPage from './SummaryFormPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchSummaries: vi.fn(),
  fetchSummary: vi.fn(),
  createSummary: vi.fn(),
  updateSummary: vi.fn(),
  deleteSummary: vi.fn(),
  generateSummary: vi.fn(),
  generateIllustration: vi.fn(),
  deleteIllustration: vi.fn(),
  fetchChat: vi.fn(),
  askCourseAssistant: vi.fn(),
  clearChat: vi.fn(),
  fetchResources: vi.fn(),
  fetchResource: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
}))

vi.mock('../../api/summaries', () => mocks)
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ addToast: mocks.addToast }) }))
vi.mock('../../hooks/useCourseOptions', () => ({
  useCourseOptions: () => ({ courses: [{ id: 1, title: 'Neural networks' }], loading: false, error: null }),
}))

const SUMMARY = {
  id: 5,
  course: 1,
  course_title: 'Neural networks',
  title: 'Neural networks in short',
  content: '## Neurons\n- A neuron computes a weighted sum.\n## Training\nBackpropagation computes the gradient.',
  key_concepts: [{ term: 'Neuron', definition: 'A unit that computes a weighted sum.' }],
  language: 'en',
  source: 'ai',
  ai_model: 'gemini',
  author_name: 'Thomas Teacher',
  is_shared: true,
  can_edit: true,
  illustration_url: null,
  illustration_prompt: '',
}
const PAGE = (results) => ({ count: results.length, next: null, previous: null, results })

function renderRoute(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/summaries" element={<SummariesPage />} />
        <Route path="/summaries/new" element={<SummaryFormPage />} />
        <Route path="/summaries/:summaryId" element={<SummaryDetailPage />} />
        <Route path="/resources/new" element={<ResourceFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchChat.mockResolvedValue([])
})

describe('summary helpers', () => {
  it('parses headings, bullet points and paragraphs', () => {
    expect(parseSummary(SUMMARY.content)).toEqual([
      { type: 'heading', text: 'Neurons' },
      { type: 'list', items: ['A neuron computes a weighted sum.'] },
      { type: 'heading', text: 'Training' },
      { type: 'paragraph', text: 'Backpropagation computes the gradient.' },
    ])
    expect(plainText('## Title\n- one\n- two!')).toBe('Title. one. two!')
  })

  it('cuts long texts into short parts for the speech engine', () => {
    const chunks = splitIntoChunks('A short sentence. '.repeat(40))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 220)).toBe(true)
  })

  it('validates the forms', () => {
    expect(validateSummary({ course: '', title: ' ', content: 'short', key_concepts: [{ term: 'x', definition: '' }] })).toEqual({
      course: 'Choose a course.',
      title: 'The title is required.',
      content: 'The summary must contain at least 20 characters.',
      key_concepts: 'Each concept needs a term and a definition (or remove the empty line).',
    })
    expect(validateResource({ course: '1', title: 'x', kind: 'link', url: 'not a url' }, {}).url).toMatch(/http/)
    expect(validateResource({ course: '1', title: 'x', kind: 'file', url: '' }, { file: null, hasFile: false }).file).toBeTruthy()
  })
})

describe('Summaries page', () => {
  it('lists summaries and switches to resources', async () => {
    const user = userEvent.setup()
    mocks.fetchSummaries.mockResolvedValue(PAGE([SUMMARY]))
    mocks.fetchResources.mockResolvedValue(
      PAGE([{ id: 2, course_title: 'Neural networks', title: '3Blue1Brown video', kind: 'link', url: 'https://example.com', is_shared: true, can_edit: false, author_name: 'T' }]),
    )
    renderRoute('/summaries')

    expect(await screen.findByRole('link', { name: 'Neural networks in short' })).toBeInTheDocument()
    expect(screen.getByText('1 key concept · by Thomas Teacher')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /resources/i }))
    expect(await screen.findByText('3Blue1Brown video')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', 'https://example.com')
  })

  it('generates a summary with AI and opens it', async () => {
    const user = userEvent.setup()
    mocks.fetchSummaries.mockResolvedValue(PAGE([]))
    mocks.generateSummary.mockResolvedValue(SUMMARY)
    mocks.fetchSummary.mockResolvedValue(SUMMARY)
    renderRoute('/summaries')

    await user.click(await screen.findByRole('button', { name: /generate with ai/i }))
    await user.selectOptions(screen.getByLabelText(/course/i, { selector: 'select[data-autofocus]' }), '1')
    await user.click(screen.getByRole('button', { name: /^generate$/i }))

    expect(mocks.generateSummary).toHaveBeenCalledWith('1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Neural networks in short' })).toBeInTheDocument()
  })
})

describe('Summary detail page', () => {
  it('shows the summary, its key concepts and generates an illustration', async () => {
    const user = userEvent.setup()
    mocks.fetchSummary.mockResolvedValue(SUMMARY)
    mocks.generateIllustration.mockResolvedValue({
      ...SUMMARY,
      illustration_url: '/api/summaries/5/illustration/?v=1',
      illustration_prompt: 'A flat diagram of a neuron',
    })
    renderRoute('/summaries/5')

    expect(await screen.findByRole('heading', { name: 'Neurons' })).toBeInTheDocument()
    expect(screen.getByText('A unit that computes a weighted sum.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /generate an illustration/i }))
    expect(mocks.generateIllustration).toHaveBeenCalledWith(5)
    expect(await screen.findByRole('img', { name: /illustration of the summary/i })).toHaveAttribute('src', '/api/summaries/5/illustration/?v=1')
    expect(screen.getByText('A flat diagram of a neuron')).toBeInTheDocument()
  })

  it('hides edit actions from readers', async () => {
    mocks.fetchSummary.mockResolvedValue({ ...SUMMARY, can_edit: false })
    renderRoute('/summaries/5')
    await screen.findByRole('heading', { name: 'Neurons' })
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate an illustration/i })).not.toBeInTheDocument()
  })

  it('asks the course assistant', async () => {
    const user = userEvent.setup()
    mocks.fetchSummary.mockResolvedValue(SUMMARY)
    mocks.askCourseAssistant.mockResolvedValue({ id: 1, question: 'What is a neuron?', answer: 'A unit that sums its inputs.' })
    renderRoute('/summaries/5')

    await user.type(await screen.findByLabelText('Your question'), 'What is a neuron?{Enter}')
    expect(mocks.askCourseAssistant).toHaveBeenCalledWith(5, 'What is a neuron?')
    expect(await screen.findByText('A unit that sums its inputs.')).toBeInTheDocument()
  })

  it('shows the assistant error and gives the question back', async () => {
    const user = userEvent.setup()
    mocks.fetchSummary.mockResolvedValue(SUMMARY)
    mocks.askCourseAssistant.mockRejectedValue(new Error('The AI service is busy right now.'))
    renderRoute('/summaries/5')

    await user.click(await screen.findByRole('button', { name: /give me a concrete example/i }))
    expect(await screen.findByText('The AI service is busy right now.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your question')).toHaveValue('Give me a concrete example.')
  })
})

describe('Forms', () => {
  it('creates a summary with key concepts', async () => {
    const user = userEvent.setup()
    mocks.createSummary.mockResolvedValue({ ...SUMMARY, id: 9 })
    mocks.fetchSummary.mockResolvedValue({ ...SUMMARY, id: 9 })
    renderRoute('/summaries/new')

    await user.click(screen.getByRole('button', { name: /create the summary/i }))
    expect(screen.getByText('Choose a course.')).toBeInTheDocument()
    expect(mocks.createSummary).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText(/course/i), '1')
    await user.type(screen.getByLabelText(/title/i), 'My notes')
    await user.type(screen.getByLabelText(/^summary/i), 'Gradient descent updates the weights.')
    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText('Term 1'), 'Gradient')
    await user.type(screen.getByLabelText('Definition'), 'Direction of steepest increase.')
    await user.click(screen.getByRole('button', { name: /create the summary/i }))

    await waitFor(() =>
      expect(mocks.createSummary).toHaveBeenCalledWith({
        course: 1,
        title: 'My notes',
        content: 'Gradient descent updates the weights.',
        key_concepts: [{ term: 'Gradient', definition: 'Direction of steepest increase.' }],
      }),
    )
  })

  it('adds a web link resource', async () => {
    const user = userEvent.setup()
    mocks.createResource.mockResolvedValue({ id: 1 })
    mocks.fetchSummaries.mockResolvedValue(PAGE([]))
    mocks.fetchResources.mockResolvedValue(PAGE([]))
    renderRoute('/resources/new')

    await user.selectOptions(screen.getByLabelText(/course/i), '1')
    await user.type(screen.getByLabelText(/title/i), 'Video')
    await user.type(screen.getByLabelText(/web address/i), 'https://example.com/video')
    await user.click(screen.getByRole('button', { name: /add the resource/i }))

    await waitFor(() =>
      expect(mocks.createResource).toHaveBeenCalledWith(
        { course: '1', title: 'Video', description: '', kind: 'link', url: 'https://example.com/video' },
        null,
      ),
    )
  })
})

describe('Audio player', () => {
  let synth

  beforeEach(() => {
    synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [] }
    window.speechSynthesis = synth
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text
    }
  })
  afterEach(() => {
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  })

  it('reads the summary aloud, pauses and resumes', async () => {
    const user = userEvent.setup()
    render(<AudioPlayer text={SUMMARY.content} language="fr" />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(synth.speak).toHaveBeenCalled()
    const first = synth.speak.mock.calls[0][0]
    expect(first.text).toContain('Neurons. A neuron computes a weighted sum.')
    expect(first.lang).toBe('fr-FR')

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(synth.pause).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(synth.resume).toHaveBeenCalled()

    // The last part ends: the player goes back to the start.
    const last = synth.speak.mock.calls.at(-1)[0]
    act(() => last.onend())
    expect(screen.getByText(/parts$/)).toBeInTheDocument()
  })

  it('says when the browser cannot read aloud', () => {
    delete window.speechSynthesis
    render(<AudioPlayer text={SUMMARY.content} />)
    expect(screen.getByText(/cannot read text aloud/i)).toBeInTheDocument()
  })
})
