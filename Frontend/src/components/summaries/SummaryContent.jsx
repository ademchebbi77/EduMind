import { parseSummary } from '../../lib/summaries'

export function SummaryContent({ text }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
      {parseSummary(text).map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h3 key={index} className="pt-2 font-display text-lg font-semibold text-ink">
              {block.text}
            </h3>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5 marker:text-brand">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )
        }
        return <p key={index}>{block.text}</p>
      })}
    </div>
  )
}
