import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input, Select, Textarea } from '../ui/Field'
import { cx } from '../../lib/cx'
import { QUESTION_TYPES, changeQuestionType, emptyOption } from '../../lib/assessments'

const MAX_OPTIONS = 10

function iconButton(tone = 'brand') {
  return cx(
    'rounded-lg p-2 text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-40',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    tone === 'clay'
      ? 'hover:bg-clay/10 hover:text-clay focus-visible:outline-clay'
      : 'hover:bg-mist hover:text-brand-strong focus-visible:outline-brand',
  )
}

export function QuestionEditor({
  question,
  index,
  total,
  errors = {},
  disabled = false,
  onChange,
  onRemove,
  onMove,
}) {
  const number = index + 1
  const isTrueFalse = question.type === 'true_false'
  const isMultiple = question.type === 'multiple_choice'
  const groupName = `question-${question.key}-correct`

  function update(fields) {
    onChange({ ...question, ...fields })
  }

  function updateOption(optionKey, fields) {
    update({
      options: question.options.map((option) =>
        option.key === optionKey ? { ...option, ...fields } : option,
      ),
    })
  }

  function markCorrect(optionKey, checked) {
    if (isMultiple) {
      updateOption(optionKey, { is_correct: checked })
      return
    }
    update({
      options: question.options.map((option) => ({
        ...option,
        is_correct: option.key === optionKey,
      })),
    })
  }

  function removeOption(optionKey) {
    update({ options: question.options.filter((option) => option.key !== optionKey) })
  }

  return (
    <fieldset
      className={cx(
        'surface min-w-0 space-y-5 border-l-4 p-5 sm:p-6',
        Object.keys(errors).length ? 'border-l-clay' : 'border-l-brand',
      )}
      disabled={disabled}
    >
      <legend className="sr-only">Question {number}</legend>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">Question {number}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move question ${number} up`}
            title="Move up"
            className={iconButton()}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move question ${number} down`}
            title="Move down"
            className={iconButton()}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove question ${number}`}
            title="Remove question"
            className={iconButton('clay')}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Textarea
        label="Question"
        rows={2}
        value={question.text}
        onChange={(event) => update({ text: event.target.value })}
        error={errors.text}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Question type"
          value={question.type}
          onChange={(event) => onChange(changeQuestionType(question, event.target.value))}
          error={errors.type}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
        <Input
          label="Points"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={question.points}
          onChange={(event) => update({ points: event.target.value })}
          error={errors.points}
          required
        />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">
            Answer options
            <span className="ml-1 text-clay" aria-hidden="true">
              *
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isMultiple
              ? 'Tick every correct option. Students must select all of them to earn the points.'
              : 'Select the single correct option.'}
          </p>
        </div>

        <ul className="space-y-2">
          {question.options.map((option, optionIndex) => {
            const inputId = `${question.key}-${option.key}`
            return (
              <li
                key={option.key}
                className={cx(
                  'flex items-center gap-3 rounded-xl border px-3 py-2 transition',
                  option.is_correct ? 'border-sage/40 bg-sage/[0.06]' : 'border-line bg-white',
                )}
              >
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name={groupName}
                  checked={option.is_correct}
                  onChange={(event) => markCorrect(option.key, event.target.checked)}
                  aria-label={`Mark option ${optionIndex + 1} as correct`}
                  className="size-4 shrink-0 accent-sage"
                />
                {isTrueFalse ? (
                  <span className="flex-1 text-sm font-medium text-ink-soft">{option.text}</span>
                ) : (
                  <>
                    <label htmlFor={inputId} className="sr-only">
                      Option {optionIndex + 1}
                    </label>
                    <input
                      id={inputId}
                      type="text"
                      value={option.text}
                      maxLength={500}
                      placeholder={`Option ${optionIndex + 1}`}
                      onChange={(event) => updateOption(option.key, { text: event.target.value })}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink-soft placeholder:text-slate-500 hover:border-line focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(option.key)}
                      disabled={question.options.length <= 2}
                      aria-label={`Remove option ${optionIndex + 1}`}
                      title="Remove option"
                      className={iconButton('clay')}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </>
                )}
                {option.is_correct ? (
                  <span className="hidden text-xs font-semibold text-sage sm:inline">Correct</span>
                ) : null}
              </li>
            )
          })}
        </ul>

        {errors.options ? (
          <p role="alert" className="text-xs font-medium text-clay">
            {errors.options}
          </p>
        ) : null}

        {!isTrueFalse ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ options: [...question.options, emptyOption()] })}
            disabled={question.options.length >= MAX_OPTIONS}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add an option
          </Button>
        ) : null}
      </div>

      <Textarea
        label="Explanation"
        rows={2}
        value={question.explanation}
        onChange={(event) => update({ explanation: event.target.value })}
        hint="Optional. Shown to students after they submit, if answers are revealed."
      />
    </fieldset>
  )
}
