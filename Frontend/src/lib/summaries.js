/**
 * Summary text format (manual or AI): a line starting with "## " is a section
 * title, a line starting with "- " is a bullet point, anything else a paragraph.
 */
export function parseSummary(text = '') {
  const blocks = []
  let list = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('- ')) {
      if (!list) {
        list = { type: 'list', items: [] }
        blocks.push(list)
      }
      list.items.push(line.slice(2))
      continue
    }
    list = null
    if (line.startsWith('## ')) blocks.push({ type: 'heading', text: line.slice(3) })
    else if (line) blocks.push({ type: 'paragraph', text: line })
  }
  return blocks
}

/** The same text without the "## " and "- " marks, for the audio player. */
export function plainText(text = '') {
  return parseSummary(text)
    .flatMap((block) => (block.type === 'list' ? block.items : [block.text]))
    .map((line) => (/[.!?:]$/.test(line) ? line : `${line}.`))
    .join(' ')
}

const CHUNK_CHARS = 220

/** Cut the text into short parts: browsers stop reading very long texts. */
export function splitIntoChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || []
  const chunks = []
  let current = ''
  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if (current && current.length + sentence.length > CHUNK_CHARS) {
      chunks.push(current)
      current = ''
    }
    current = `${current} ${sentence}`.trim()
  }
  if (current) chunks.push(current)
  return chunks
}

/** Client-side checks of the summary form; the server checks the same rules again. */
export function validateSummary(values) {
  const errors = {}
  if (!values.course) errors.course = 'Choose a course.'
  if (!values.title.trim()) errors.title = 'The title is required.'
  if (values.content.trim().length < 20) errors.content = 'The summary must contain at least 20 characters.'
  if (values.key_concepts.some((concept) => !concept.term.trim() || !concept.definition.trim())) {
    errors.key_concepts = 'Each concept needs a term and a definition (or remove the empty line).'
  }
  return errors
}

export function validateResource(values, { file, hasFile }) {
  const errors = {}
  if (!values.course) errors.course = 'Choose a course.'
  if (!values.title.trim()) errors.title = 'The title is required.'
  if (values.kind === 'link' && !/^https?:\/\/\S+$/i.test(values.url.trim())) {
    errors.url = 'Enter a web address starting with http:// or https://.'
  }
  if (values.kind === 'file' && !file && !hasFile) errors.file = 'Choose the file to share.'
  return errors
}
