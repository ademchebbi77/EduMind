import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as commentsApi from '../../api/courseComments'
import { useAuth } from '../../context/AuthContext'
import { CourseComments } from './CourseComments'

vi.mock('../../api/courseComments')
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

function makeComment(overrides = {}) {
  return {
    id: 1,
    course: 7,
    author: 3,
    author_name: 'Sofia Ben Ali',
    text: 'Very clear course!',
    created_at: '2026-10-27T10:00:00Z',
    edited_at: null,
    reply: '',
    replied_by_name: '',
    replied_at: null,
    is_mine: false,
    can_edit: false,
    can_delete: false,
    can_reply: false,
    ...overrides,
  }
}

function page(results, next = null) {
  return { count: results.length, next, previous: null, results }
}

function signInAs(role) {
  useAuth.mockReturnValue({ user: { id: 3, role } })
}

describe('CourseComments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists the comments with the teacher reply', async () => {
    signInAs('student')
    commentsApi.fetchCourseComments.mockResolvedValue(
      page([
        makeComment({
          reply: 'Thanks, see lesson 2.',
          replied_by_name: 'Thomas Enseignant',
          replied_at: '2026-10-27T11:00:00Z',
        }),
      ]),
    )

    render(<CourseComments courseId={7} />)

    expect(await screen.findByText('Very clear course!')).toBeInTheDocument()
    expect(screen.getByText('Thanks, see lesson 2.')).toBeInTheDocument()
    expect(screen.getByText("Teacher's reply")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /comments\s*\(1\)/i })).toBeInTheDocument()
    expect(commentsApi.fetchCourseComments).toHaveBeenCalledWith(7, {}, expect.anything())
  })

  it('lets a student post a comment', async () => {
    const user = userEvent.setup()
    signInAs('student')
    commentsApi.fetchCourseComments.mockResolvedValue(page([]))
    commentsApi.createCourseComment.mockResolvedValue(
      makeComment({ id: 9, text: 'My new comment', is_mine: true, can_edit: true, can_delete: true }),
    )

    render(<CourseComments courseId={7} />)
    expect(await screen.findByText(/no comments yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /post comment/i }))
    expect(screen.getByText('Write something first.')).toBeInTheDocument()
    expect(commentsApi.createCourseComment).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/add a comment/i), '  My new comment ')
    await user.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByText('My new comment')).toBeInTheDocument()
    expect(commentsApi.createCourseComment).toHaveBeenCalledWith(7, 'My new comment')
    expect(screen.getByLabelText(/add a comment/i)).toHaveValue('')
  })

  it('shows server validation errors on the form', async () => {
    const user = userEvent.setup()
    signInAs('student')
    commentsApi.fetchCourseComments.mockResolvedValue(page([]))
    commentsApi.createCourseComment.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: { message: 'Invalid', fields: { text: ['Too long.'] } } } },
    })

    render(<CourseComments courseId={7} />)
    await screen.findByText(/no comments yet/i)
    await user.type(screen.getByLabelText(/add a comment/i), 'Hello')
    await user.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('lets the author edit and delete their comment', async () => {
    const user = userEvent.setup()
    signInAs('student')
    const mine = makeComment({ is_mine: true, can_edit: true, can_delete: true })
    commentsApi.fetchCourseComments.mockResolvedValue(page([mine]))
    commentsApi.updateCourseComment.mockResolvedValue({
      ...mine,
      text: 'Edited text',
      edited_at: '2026-10-27T12:00:00Z',
    })
    commentsApi.deleteCourseComment.mockResolvedValue()

    render(<CourseComments courseId={7} />)
    await screen.findByText('Very clear course!')
    expect(screen.getByText('(you)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    const box = screen.getByLabelText(/edit your comment/i)
    await user.clear(box)
    await user.type(box, 'Edited text')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('Edited text')).toBeInTheDocument()
    expect(screen.getByText(/edited/, { selector: 'p.text-xs' })).toBeInTheDocument()
    expect(commentsApi.updateCourseComment).toHaveBeenCalledWith(1, 'Edited text')

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /delete permanently/i }))

    await waitFor(() => expect(screen.queryByText('Edited text')).not.toBeInTheDocument())
    expect(commentsApi.deleteCourseComment).toHaveBeenCalledWith(1)
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('hides edit and delete on comments of other students', async () => {
    signInAs('student')
    commentsApi.fetchCourseComments.mockResolvedValue(page([makeComment()]))

    render(<CourseComments courseId={7} />)
    await screen.findByText('Very clear course!')

    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reply/i })).toBeNull()
  })

  it('lets the course teacher reply, edit and delete the reply', async () => {
    const user = userEvent.setup()
    signInAs('teacher')
    const comment = makeComment({ can_reply: true, can_delete: true })
    const answered = {
      ...comment,
      reply: 'Glad it helped!',
      replied_by_name: 'Thomas Enseignant',
      replied_at: '2026-10-27T11:00:00Z',
    }
    commentsApi.fetchCourseComments.mockResolvedValue(page([comment]))
    commentsApi.replyToCourseComment
      .mockResolvedValueOnce(answered)
      .mockResolvedValueOnce({ ...answered, reply: 'Glad it helped a lot!' })
    commentsApi.deleteCourseCommentReply.mockResolvedValue(comment)

    render(<CourseComments courseId={7} />)
    await screen.findByText('Very clear course!')
    expect(screen.queryByLabelText(/add a comment/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: /^reply$/i }))
    await user.type(screen.getByLabelText(/your reply/i), 'Glad it helped!')
    await user.click(screen.getByRole('button', { name: /send reply/i }))
    expect(await screen.findByText('Glad it helped!')).toBeInTheDocument()
    expect(commentsApi.replyToCourseComment).toHaveBeenCalledWith(1, 'Glad it helped!')

    await user.click(screen.getByRole('button', { name: /edit reply/i }))
    const box = screen.getByLabelText(/edit your reply/i)
    await user.clear(box)
    await user.type(box, 'Glad it helped a lot!')
    await user.click(screen.getByRole('button', { name: /save reply/i }))
    expect(await screen.findByText('Glad it helped a lot!')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /delete reply/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /delete permanently/i }))

    await waitFor(() => expect(screen.queryByText('Glad it helped a lot!')).not.toBeInTheDocument())
    expect(commentsApi.deleteCourseCommentReply).toHaveBeenCalledWith(1)
    expect(screen.getByText('Very clear course!')).toBeInTheDocument()
  })

  it('loads more comments', async () => {
    const user = userEvent.setup()
    signInAs('student')
    commentsApi.fetchCourseComments
      .mockResolvedValueOnce({ ...page([makeComment()], 'next'), count: 2 })
      .mockResolvedValueOnce(page([makeComment({ id: 2, text: 'Second comment' })]))

    render(<CourseComments courseId={7} />)
    await screen.findByText('Very clear course!')
    await user.click(screen.getByRole('button', { name: /show more comments/i }))

    expect(await screen.findByText('Second comment')).toBeInTheDocument()
    expect(commentsApi.fetchCourseComments).toHaveBeenLastCalledWith(7, { page: 2 })
    expect(screen.queryByRole('button', { name: /show more comments/i })).toBeNull()
  })

  it('shows an error when the comments cannot be loaded', async () => {
    signInAs('student')
    commentsApi.fetchCourseComments.mockRejectedValue({})

    render(<CourseComments courseId={7} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load the comments/i)
  })
})
