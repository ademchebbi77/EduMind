import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as voiceApi from '../../api/voiceQuestions'
import VoiceReviewsPage from '../../pages/voice/VoiceReviewsPage'
import { AnswerFeedback, TeacherAnswer } from './AnswerFeedback'
import { VoiceHistory } from './VoiceHistory'

vi.mock('../../api/voiceQuestions')
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

function makeQuestion(overrides = {}) {
  return {
    id: 'q1',
    status: 'answered',
    course_title: 'SQL',
    question_text: 'What is a left join?',
    transcript: 'What is a left join?',
    answer: 'A left join keeps every row of the left table.',
    rating: '',
    rating_reason: '',
    rating_comment: '',
    escalated_at: null,
    review_status: '',
    teacher_answer: '',
    teacher_answered_by_name: '',
    teacher_answered_at: null,
    created_at: '2026-10-27T10:00:00Z',
    ...overrides,
  }
}

describe('AnswerFeedback (student)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records a helpful rating', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    voiceApi.rateVoiceQuestion.mockResolvedValue(makeQuestion({ rating: 'helpful' }))

    render(<AnswerFeedback question={makeQuestion()} onChange={onChange} />)
    expect(screen.getByText('Was this answer helpful?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /yes/i }))

    expect(voiceApi.rateVoiceQuestion).toHaveBeenCalledWith('q1', { rating: 'helpful' })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rating: 'helpful' }))
  })

  it('asks for a reason before saving a negative rating', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    voiceApi.rateVoiceQuestion.mockResolvedValue(
      makeQuestion({ rating: 'not_helpful', rating_reason: 'incomplete' }),
    )

    render(<AnswerFeedback question={makeQuestion()} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /^no$/i }))
    await user.click(screen.getByRole('button', { name: /save my feedback/i }))
    expect(screen.getByText('Tell us what was wrong with the answer.')).toBeInTheDocument()
    expect(voiceApi.rateVoiceQuestion).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText(/what was wrong/i), 'incomplete')
    await user.type(screen.getByLabelText(/note for your teacher/i), 'No example')
    await user.click(screen.getByRole('button', { name: /save my feedback/i }))

    expect(voiceApi.rateVoiceQuestion).toHaveBeenCalledWith('q1', {
      rating: 'not_helpful',
      reason: 'incomplete',
      comment: 'No example',
    })
    expect(onChange).toHaveBeenCalled()
  })

  it('sends a not helpful answer to the teacher', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rated = makeQuestion({ rating: 'not_helpful', rating_reason: 'wrong', rating_comment: 'Not what we saw' })
    voiceApi.escalateVoiceQuestion.mockResolvedValue({
      ...rated,
      escalated_at: '2026-10-27T11:00:00Z',
      review_status: 'pending',
    })

    render(<AnswerFeedback question={rated} onChange={onChange} />)
    expect(screen.getByText(/not helpful/i)).toBeInTheDocument()
    expect(screen.getByText(/Not what we saw/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ask my teacher/i }))

    expect(voiceApi.escalateVoiceQuestion).toHaveBeenCalledWith('q1')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ review_status: 'pending' }))
  })

  it('shows the waiting message once sent', () => {
    render(
      <AnswerFeedback
        question={makeQuestion({ rating: 'not_helpful', escalated_at: '2026-10-27T11:00:00Z', review_status: 'pending' })}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/sent to your teacher/i)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the verified teacher answer', () => {
    render(
      <TeacherAnswer
        question={makeQuestion({
          review_status: 'answered',
          teacher_answer: 'A LEFT JOIN keeps unmatched rows with NULLs.',
          teacher_answered_by_name: 'Thomas Martin',
          teacher_answered_at: '2026-10-27T12:00:00Z',
        })}
      />,
    )

    expect(screen.getByText('Verified by the teacher')).toBeInTheDocument()
    expect(screen.getByText('A LEFT JOIN keeps unmatched rows with NULLs.')).toBeInTheDocument()
    expect(screen.getByText(/Thomas Martin/)).toBeInTheDocument()
  })

  it('marks questions with the teacher in the history', () => {
    render(
      <VoiceHistory
        items={[
          makeQuestion({ id: 'a', review_status: 'pending' }),
          makeQuestion({ id: 'b', review_status: 'answered' }),
        ]}
        loading={false}
        error=""
        activeId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('With your teacher')).toBeInTheDocument()
    expect(screen.getByText('Verified by the teacher')).toBeInTheDocument()
  })
})

describe('VoiceReviewsPage (teacher)', () => {
  beforeEach(() => vi.resetAllMocks())

  const pending = {
    id: 'q1',
    course_title: 'SQL',
    student_name: 'Sofia Ben Ali',
    question_text: 'What is a left join?',
    answer: 'A left join keeps every row of the left table.',
    rating_reason: 'incomplete',
    rating_reason_display: 'Incomplete',
    rating_comment: 'No example',
    escalated_at: '2026-10-27T11:00:00Z',
    review_status: 'pending',
    teacher_answer: '',
    teacher_answered_at: null,
  }

  it('lists the pending questions and sends a verified answer', async () => {
    const user = userEvent.setup()
    voiceApi.fetchVoiceReviews.mockResolvedValue({ count: 1, next: null, results: [pending] })
    voiceApi.answerVoiceReview.mockResolvedValue({
      ...pending,
      review_status: 'answered',
      teacher_answer: 'It keeps unmatched rows with NULLs.',
    })

    render(<VoiceReviewsPage />)

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('What is a left join?')).toBeInTheDocument()
    expect(within(card).getByText('Incomplete')).toBeInTheDocument()
    expect(within(card).getByText(/No example/)).toBeInTheDocument()
    expect(voiceApi.fetchVoiceReviews).toHaveBeenCalledWith({ status: 'pending' }, expect.anything())

    await user.click(within(card).getByRole('button', { name: /send the answer/i }))
    expect(within(card).getByText('Write the answer first.')).toBeInTheDocument()

    await user.type(within(card).getByLabelText(/your verified answer/i), 'It keeps unmatched rows with NULLs.')
    await user.click(within(card).getByRole('button', { name: /send the answer/i }))

    expect(voiceApi.answerVoiceReview).toHaveBeenCalledWith('q1', 'It keeps unmatched rows with NULLs.')
    expect(await screen.findByText('No question to answer')).toBeInTheDocument()
  })

  it('switches to the answered questions', async () => {
    const user = userEvent.setup()
    voiceApi.fetchVoiceReviews
      .mockResolvedValueOnce({ count: 0, next: null, results: [] })
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        results: [{ ...pending, review_status: 'answered', teacher_answer: 'Verified text' }],
      })

    render(<VoiceReviewsPage />)
    expect(await screen.findByText('No question to answer')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /answered/i }))

    expect(await screen.findByText('Verified text')).toBeInTheDocument()
    expect(voiceApi.fetchVoiceReviews).toHaveBeenLastCalledWith({ status: 'answered' }, expect.anything())
    expect(screen.getByRole('button', { name: /edit the answer/i })).toBeInTheDocument()
  })
})
