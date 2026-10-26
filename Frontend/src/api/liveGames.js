import { api } from '../lib/api'

// Teacher: start a game from a quiz.
export async function createLiveGame(quizId) {
  const { data } = await api.post('/live-games/', { quiz: quizId })
  return data
}

// Student: join with the PIN shown on the teacher's screen.
export async function joinLiveGame(pin) {
  const { data } = await api.post('/live-games/join/', { pin })
  return data
}

// Everyone: the current state of the game (called every second).
export async function fetchLiveGame(gameId) {
  const { data } = await api.get(`/live-games/${gameId}/`)
  return data
}

// Teacher: next step (start, show the answer, next question, finish).
export async function nextLiveStep(gameId) {
  const { data } = await api.post(`/live-games/${gameId}/next/`)
  return data
}

// Student: answer the current question.
export async function answerLiveGame(gameId, selectedOptions) {
  const { data } = await api.post(`/live-games/${gameId}/answer/`, {
    selected_options: selectedOptions,
  })
  return data
}
