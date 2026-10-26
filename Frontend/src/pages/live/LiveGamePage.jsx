import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Clock3, Crown, Loader2, Trophy, Users, XCircle } from 'lucide-react'
import { answerLiveGame, fetchLiveGame, nextLiveStep } from '../../api/liveGames'
import { normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'

// One colour per answer, like Kahoot (the letter helps colour-blind players).
const OPTION_STYLES = ['bg-brand-strong', 'bg-sage', 'bg-clay', 'bg-ink', 'bg-slate-600', 'bg-brand']
const LETTERS = 'ABCDEF'

export default function LiveGamePage() {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Answers ticked for a multiple-choice question, remembered with its number so a
  // new question always starts with nothing selected.
  const [selection, setSelection] = useState({ question: 0, ids: [] })

  useDocumentTitle(game ? `Live: ${game.quiz_title}` : 'Live quiz')

  // Ask the server for the game state every second.
  useEffect(() => {
    let active = true
    function refresh() {
      fetchLiveGame(gameId)
        .then((data) => active && setGame(data))
        .catch((requestError) => active && setError(normalizeApiError(requestError, 'Game not found.').message))
    }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [gameId])

  async function run(action) {
    setBusy(true)
    try {
      setGame(await action())
    } catch (actionError) {
      setError(normalizeApiError(actionError, 'Something went wrong.').message)
      window.setTimeout(() => setError(''), 3000)
    } finally {
      setBusy(false)
    }
  }

  if (!game && error) {
    return <EmptyState icon={XCircle} title="Live quiz unavailable" description={error} action={<LinkButton to="/dashboard">Back</LinkButton>} />
  }
  if (!game) return <PageLoader label="Joining the game…" />

  const host = game.is_host
  const question = game.question
  const isMultiple = question?.type === 'multiple_choice'
  const answered = game.me?.answered
  const timeUp = game.status === 'question' && game.seconds_left === 0
  const selected = selection.question === game.question_number ? selection.ids : []

  function choose(optionId) {
    if (isMultiple) {
      const ids = selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]
      setSelection({ question: game.question_number, ids })
    } else {
      setSelection({ question: game.question_number, ids: [optionId] }) // highlight my choice
      run(() => answerLiveGame(gameId, [optionId]))
    }
  }

  const nextLabel = {
    lobby: 'Start the game',
    question: 'Show the answer',
    results: game.question_number >= game.question_count ? 'Show the podium' : 'Next question',
  }[game.status]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">Live quiz</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{game.quiz_title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {game.status === 'question' ? (
            <span role="timer" aria-label={`${game.seconds_left} seconds left`} className={cx('inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-display text-2xl font-semibold', game.seconds_left <= 5 ? 'border-clay/40 text-clay' : 'border-line text-ink')}>
              <Clock3 className="size-5" aria-hidden="true" />
              {game.seconds_left}
            </span>
          ) : null}
          {host && nextLabel ? (
            <Button variant="accent" onClick={() => run(() => nextLiveStep(gameId))} loading={busy}>
              {nextLabel}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay">{error}</p> : null}

      {/* 1. Lobby: the PIN and the players who joined */}
      {game.status === 'lobby' ? (
        <Card className="text-center">
          {host ? (
            <>
              <p className="text-sm text-slate-600">Students join from <strong>Live quiz</strong> with this PIN:</p>
              <p className="mt-2 font-display text-6xl font-semibold tracking-[0.2em] text-ink">{game.pin}</p>
            </>
          ) : (
            <p className="text-lg font-semibold text-ink">You are in! Waiting for the teacher to start…</p>
          )}
          <p className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <Users className="size-4" aria-hidden="true" />
            {game.players.length} player{game.players.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {game.players.map((name, index) => (
              <li key={`${name}-${index}`} className="rounded-full bg-mist px-3 py-1 text-sm font-medium text-ink-soft">{name}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 2. Question and 3. Results */}
      {question && (game.status === 'question' || game.status === 'results') ? (
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
            Question {game.question_number} / {game.question_count}
            {host ? ` · ${game.answers_count} answer${game.answers_count === 1 ? '' : 's'}` : ''}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{question.text}</h2>
          {isMultiple && !host && game.status === 'question' ? <p className="mt-1 text-sm text-slate-600">Several answers are correct: select them all, then submit.</p> : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {question.options.map((option, index) => {
              const correct = game.correct_options?.includes(option.id)
              const canAnswer = !host && game.status === 'question' && !answered && !timeUp
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!canAnswer || busy}
                  onClick={() => choose(option.id)}
                  aria-pressed={selected.includes(option.id)}
                  className={cx(
                    'flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-left text-base font-semibold text-paper transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    OPTION_STYLES[index % OPTION_STYLES.length],
                    game.status === 'results' && !correct && 'opacity-40',
                    selected.includes(option.id) && 'ring-4 ring-gold',
                    canAnswer ? 'hover:brightness-110' : 'cursor-default',
                  )}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20">{LETTERS[index]}</span>
                  <span className="flex-1">{option.text}</span>
                  {game.status === 'results' ? (
                    <span className="inline-flex items-center gap-1 text-sm">
                      {correct ? <CheckCircle2 className="size-5" aria-label="Correct answer" /> : null}
                      {game.answer_counts?.[option.id] ?? 0}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {isMultiple && !host && game.status === 'question' && !answered && !timeUp ? (
            <div className="mt-4 flex justify-end">
              <Button variant="accent" disabled={!selected.length} loading={busy} onClick={() => run(() => answerLiveGame(gameId, selected))}>
                Submit my answer
              </Button>
            </div>
          ) : null}

          {!host && game.status === 'question' && (answered || timeUp) ? (
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {answered ? 'Answer sent! Waiting for the others…' : 'Time is up! Waiting for the teacher…'}
            </p>
          ) : null}

          {!host && game.status === 'results' ? (
            <p aria-live="polite" className={cx('mt-5 text-lg font-semibold', game.me?.last_correct ? 'text-sage' : 'text-clay')}>
              {game.me?.last_correct ? `Correct! +${game.me.last_points} points` : game.me?.answered ? 'Wrong answer' : 'No answer'}
              <span className="ml-2 text-sm font-medium text-slate-600">· {game.me?.score} points · rank {game.me?.rank}</span>
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Leaderboard after each question, podium at the end */}
      {game.leaderboard ? (
        <Card>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
            {game.status === 'finished' ? <Crown className="size-5 text-brand" aria-hidden="true" /> : <Trophy className="size-5 text-brand" aria-hidden="true" />}
            {game.status === 'finished' ? 'Final podium' : 'Leaderboard'}
          </h2>
          <ol className="mt-4 space-y-2">
            {game.leaderboard.map((player, index) => (
              <li key={`${player.name}-${index}`} className={cx('flex items-center justify-between rounded-xl border px-4 py-2.5', index === 0 ? 'border-brand/40 bg-brand/[0.06]' : 'border-line bg-white')}>
                <span className="font-semibold text-ink">
                  {index < 3 && game.status === 'finished' ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`} {player.name}
                </span>
                <span className="font-display text-lg font-semibold tabular-nums text-ink">{player.score}</span>
              </li>
            ))}
          </ol>
          {game.status === 'finished' ? (
            <div className="mt-5 flex justify-end">
              <LinkButton to={host ? '/assessments' : '/dashboard'} variant="secondary">Leave</LinkButton>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
