import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Trash2 } from 'lucide-react'
import { askCourseAssistant, clearChat, fetchChat } from '../../api/summaries'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const SUGGESTIONS = [
  'Explain the main idea of this course simply.',
  'What should I review before the quiz?',
  'Give me a concrete example.',
]

/** Chat with Gemini about one course (the full course text is the context). */
export function CourseChat({ summaryId }) {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState('') // question waiting for its answer
  const [error, setError] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchChat(summaryId, { signal: controller.signal })
      .then(setMessages)
      .catch((requestError) => {
        if (!isCanceled(requestError)) setError(normalizeApiError(requestError, 'Unable to load the conversation.').message)
      })
    return () => controller.abort()
  }, [summaryId])

  // Keep the newest message visible.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, pending])

  async function ask(text) {
    const value = text.trim()
    if (!value || pending) return
    setPending(value)
    setQuestion('')
    setError('')
    try {
      const message = await askCourseAssistant(summaryId, value)
      setMessages((current) => [...current, message])
    } catch (requestError) {
      setError(normalizeApiError(requestError, 'The assistant could not answer.').message)
      setQuestion(value) // give the question back so it can be sent again
    } finally {
      setPending('')
    }
  }

  async function clear() {
    await clearChat(summaryId)
    setMessages([])
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-sage/10 text-sage">
            <Bot className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Course assistant</h2>
            <p className="text-xs text-slate-600">Ask anything about this course. Answers are based on the full course text.</p>
          </div>
        </div>
        {messages.length ? (
          <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear the conversation">
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div ref={listRef} className="max-h-[28rem] space-y-3 overflow-y-auto" aria-live="polite">
        {!messages.length && !pending ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-brand hover:text-brand-strong"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{message.question}</p>
            <p className="w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-mist px-4 py-2.5 text-sm leading-relaxed text-ink-soft">
              {message.answer}
            </p>
          </div>
        ))}

        {pending ? (
          <div className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{pending}</p>
            <p className="inline-flex items-center gap-2 rounded-2xl bg-mist px-4 py-2.5 text-sm text-slate-600">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              The assistant is reading the course…
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-2.5 text-sm text-clay">
          {error}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          ask(question)
        }}
      >
        <label htmlFor="course-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="course-question"
          rows={2}
          maxLength={1000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              ask(question)
            }
          }}
          placeholder="Ask a question about the course…"
          className="flex-1 resize-none rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink-soft shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <Button type="submit" variant="accent" disabled={!question.trim() || Boolean(pending)} aria-label="Send">
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </Card>
  )
}
