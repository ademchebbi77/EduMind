import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JoinLivePage from './JoinLivePage'
import LiveGamePage from './LiveGamePage'

const mocks = vi.hoisted(() => ({
  createLiveGame: vi.fn(),
  joinLiveGame: vi.fn(),
  fetchLiveGame: vi.fn(),
  nextLiveStep: vi.fn(),
  answerLiveGame: vi.fn(),
}))
vi.mock('../../api/liveGames', () => mocks)

const BASE = {
  id: 7,
  pin: '482913',
  quiz_title: 'Neural networks',
  question_number: 0,
  question_count: 2,
  seconds_left: 0,
  players: ['Alice', 'Bob'],
}
const QUESTION = {
  text: 'Capital of France?',
  type: 'single_choice',
  options: [
    { id: 1, text: 'Paris' },
    { id: 2, text: 'Lyon' },
  ],
}

function renderPage(entry = '/live/7') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/live" element={<JoinLivePage />} />
        <Route path="/live/:gameId" element={<LiveGamePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Live quiz', () => {
  it('shows the PIN and players to the host, who starts the game', async () => {
    const user = userEvent.setup()
    mocks.fetchLiveGame.mockResolvedValue({ ...BASE, status: 'lobby', is_host: true })
    mocks.nextLiveStep.mockResolvedValue({ ...BASE, status: 'question', is_host: true, question_number: 1, seconds_left: 20, question: QUESTION, answers_count: 0 })
    renderPage()

    expect(await screen.findByText('482913')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start the game' }))

    expect(mocks.nextLiveStep).toHaveBeenCalledWith('7')
    expect(await screen.findByText('Capital of France?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show the answer' })).toBeInTheDocument()
  })

  it('lets a student answer once', async () => {
    const user = userEvent.setup()
    const question = { ...BASE, status: 'question', is_host: false, question_number: 1, seconds_left: 15, question: QUESTION, me: { score: 0, rank: 1, answered: false } }
    mocks.fetchLiveGame.mockResolvedValue(question)
    mocks.answerLiveGame.mockResolvedValue({ ...question, me: { score: 0, rank: 1, answered: true } })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /paris/i }))

    expect(mocks.answerLiveGame).toHaveBeenCalledWith('7', [1])
    expect(await screen.findByText(/answer sent/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lyon/i })).toBeDisabled()
  })

  it('shows the correct answer, the student result and the leaderboard', async () => {
    mocks.fetchLiveGame.mockResolvedValue({
      ...BASE,
      status: 'results',
      is_host: false,
      question_number: 1,
      question: QUESTION,
      correct_options: [1],
      answer_counts: { 1: 1, 2: 1 },
      leaderboard: [{ name: 'Alice', score: 950 }, { name: 'Bob', score: 0 }],
      me: { score: 950, rank: 1, answered: true, last_correct: true, last_points: 950 },
    })
    renderPage()

    expect(await screen.findByText(/correct! \+950 points/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument()
    expect(screen.getByText('Leaderboard')).toBeInTheDocument()
  })

  it('joins a game with its PIN', async () => {
    const user = userEvent.setup()
    mocks.joinLiveGame.mockResolvedValue({ ...BASE, status: 'lobby', is_host: false })
    mocks.fetchLiveGame.mockResolvedValue({ ...BASE, status: 'lobby', is_host: false })
    renderPage('/live')

    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByText(/enter the 6-digit pin/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/game pin/i), '482913')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(mocks.joinLiveGame).toHaveBeenCalledWith('482913'))
    expect(await screen.findByText(/waiting for the teacher to start/i)).toBeInTheDocument()
  })
})
