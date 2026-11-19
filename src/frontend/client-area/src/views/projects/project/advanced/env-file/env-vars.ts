// The line model of the env-vars table: every function works on the raw file text, so untouched lines keep their bytes
// (quotes, `export`, inline comments, CRLF/LF per line). Behaviour is the same as legacy; only the types differ.

/** A `KEY=value` line of the file. `line` is the 0-based index in the file. */
export interface EnvVariable {
  line: number
  key: string
  value: string
  exported: boolean
  /** Multi-line quoted value: shown in the table, not editable or removable. */
  readonly?: boolean
}

/** One parsed row of `parseEnvText`. */
export type EnvRow
  = | { type: 'variable', key: string, value: string }
    | { type: 'comment', text: string }
    | { type: 'blank' }

export interface ImportResult {
  text: string
  added: number
  updated: number
  skipped: number
}

interface QuoteOptions {
  single?: boolean
}

interface Segment {
  line: string
  end: string
}

interface ParsedLine {
  key: string
  value: string
  exported: boolean
}

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = { 'n': '\n', 'r': '\r', 't': '\t', '"': '"', '\\': '\\' }

const VARIABLE_LINE = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/s

/** Splits the text into rows; a trailing empty line after the last `\n` is dropped. */
export function parseEnvText (text: string | null | undefined): EnvRow[] {
  const rows: EnvRow[] = []
  if (!text) {
    return rows
  }
  const lines = text.split(/\r?\n/)
  const lastIndex = lines.length - 1
  for (const [index, line_] of lines.entries()) {
    const line = line_ ?? ''
    const trimmed = line.trim()
    if (trimmed === '') {
      if (index === lastIndex) {
        continue
      }
      rows.push({ type: 'blank' })
      continue
    }
    if (trimmed.startsWith('#')) {
      rows.push({ type: 'comment', text: line })
      continue
    }
    const m = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/s.exec(line)
    if (m) {
      rows.push({ type: 'variable', key: m[1] ?? '', value: unquoteValue(m[2] ?? '') })
      continue
    }
    rows.push({ type: 'comment', text: line })
  }
  return rows
}

function findClosingQuote (value: string, quote: string): number {
  for (let i = 1; i < value.length; i++) {
    if (quote === '"' && value[i] === '\\') {
      i++
      continue
    }
    if (value[i] === quote) {
      return i
    }
  }
  return -1
}

/** Quoted values lose their quotes (double quotes decode escapes), unquoted ones lose ` # comment`. */
export function unquoteValue (raw: string): string {
  let value = raw
  const first = value.charAt(0)
  if (first === '"' || first === '\'') {
    const close = findClosingQuote(value, first)
    // Only whitespace or an inline comment may follow the closing quote.
    if (close > 0 && /^\s*(?:#.*)?$/s.test(value.slice(Math.max(0, close + 1)))) {
      const inner = value.slice(1, close)
      if (first === '\'') {
        return inner
      }
      return inner.replace(/\\(.)/gs, (match, c: string) =>
        c in DOUBLE_QUOTE_ESCAPES ? DOUBLE_QUOTE_ESCAPES[c] ?? match : match,
      )
    }
  }
  const hashIndex = value.indexOf(' #')
  if (hashIndex !== -1) {
    value = value.slice(0, Math.max(0, hashIndex))
  }
  return value.trim()
}

/** Quotes a value only when the file format needs it. `single` keeps `'…'` literal (no `${VAR}` expansion). */
export function quoteIfNeeded (value: string, { single = false }: QuoteOptions = {}): string {
  if (value === '') {
    return ''
  }
  // Single quotes keep the value literal (no ${VAR} expansion); used when the source line had them.
  if (single && !/['\r\n]/.test(value)) {
    return `'${value}'`
  }
  if (/[\s"'#\\]/.test(value) || value.charAt(0) === '"' || value.charAt(0) === '\'') {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, String.raw`\"`)
      .replace(/\n/g, String.raw`\n`)
      .replace(/\r/g, String.raw`\r`)
      .replace(/\t/g, String.raw`\t`)
    return `"${escaped}"`
  }
  return value
}

/** Lines without terminators, the dominant line ending (CRLF only when present) and the trailing-newline flag. */
export function splitEnvLines (text: string | null | undefined = ''): { lines: string[], eol: string, trailingNewline: boolean } {
  const source = text ?? ''
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const trailingNewline = source.endsWith('\n')
  const lines = source === '' ? [] : source.split(/\r?\n/)
  if (trailingNewline) {
    lines.pop()
  }
  return { lines, eol, trailingNewline }
}

// Lines with their own terminators, so untouched lines keep a mixed CRLF/LF layout.
function splitSegments (text: string | null | undefined = ''): Segment[] {
  const source = text ?? ''
  const segments: Segment[] = []
  const pattern = /\r?\n/g
  let start = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(source)) !== null) {
    segments.push({ line: source.slice(start, m.index), end: m[0] })
    start = m.index + m[0].length
  }
  if (start < source.length) {
    segments.push({ line: source.slice(Math.max(0, start)), end: '' })
  }
  return segments
}

function joinSegments (segments: Segment[]): string {
  return segments.map(segment => segment.line + segment.end).join('')
}

// Whitespace plus "# comment" after the value, kept when the line is rewritten.
function inlineComment (raw: string): string {
  const quote = raw.charAt(0)
  if (quote === '"' || quote === '\'') {
    const close = findClosingQuote(raw, quote)
    if (close === -1) {
      return ''
    }
    const rest = raw.slice(Math.max(0, close + 1))
    return /^\s*#/.test(rest) ? rest : ''
  }
  const hashIndex = raw.indexOf(' #')
  if (hashIndex === -1) {
    return ''
  }
  const spaces = /\s*$/.exec(raw.slice(0, Math.max(0, hashIndex)))?.[0] ?? ''
  return spaces + raw.slice(Math.max(0, hashIndex))
}

function parseVariableLine (line: string): ParsedLine | null {
  if (line.trim().startsWith('#')) {
    return null
  }
  const m = VARIABLE_LINE.exec(line)
  if (!m) {
    return null
  }
  return {
    key: m[1] ?? '',
    value: unquoteValue(m[2] ?? ''),
    exported: /^\s*export\s/.test(line),
  }
}

function isSingleQuoted (line: string): boolean {
  const m = VARIABLE_LINE.exec(line)
  return !!m && (m[2] ?? '').charAt(0) === '\''
}

// Index of the last line of a quoted value that starts on lines[start] and spans
// several lines, or -1 when the value is on one line (or never closes).
function multilineEnd (lines: string[], start: number): number {
  const line = lines[start] ?? ''
  const m = VARIABLE_LINE.exec(line)
  if (!m || line.trim().startsWith('#')) {
    return -1
  }
  const raw = m[2] ?? ''
  const quote = raw.charAt(0)
  if ((quote !== '"' && quote !== '\'') || findClosingQuote(raw, quote) !== -1) {
    return -1
  }
  let joined = raw
  for (let i = start + 1; i < lines.length; i++) {
    joined += '\n' + (lines[i] ?? '')
    if (findClosingQuote(joined, quote) !== -1) {
      return i
    }
  }
  return -1
}

/** Every `KEY=value` line; a multi-line quoted value is listed once as `readonly` and its inner lines are skipped. */
export function listVariables (text: string | null | undefined): EnvVariable[] {
  const result: EnvVariable[] = []
  const { lines } = splitEnvLines(text)
  for (let index = 0; index < lines.length; index++) {
    const end = multilineEnd(lines, index)
    if (end !== -1) {
      // Multi-line values are shown but not editable: line edits would split them.
      const raw = lines.slice(index, end + 1).join('\n')
      const variable = parseVariableLine(raw)
      if (variable) {
        result.push({ line: index, ...variable, readonly: true })
      }
      index = end
      continue
    }
    const variable = parseVariableLine(lines[index] ?? '')
    if (variable) {
      result.push({ line: index, ...variable })
    }
  }
  return result
}

/** A valid env key: `[A-Za-z_][A-Za-z0-9_]*`. */
export function isValidEnvKey (key: string | null | undefined): boolean {
  return /^[A-Z_]\w*$/i.test(key || '')
}

/** Appends `KEY=value` as the last line, keeping the file's line ending. */
export function addVariable (text: string | null | undefined, key: string, value: string, { single = false }: QuoteOptions = {}): string {
  const { eol, trailingNewline } = splitEnvLines(text)
  const segments = splitSegments(text)
  const last = segments.at(-1)
  const end = last && last.end ? last.end : eol
  if (last && !last.end) {
    last.end = end
  }
  segments.push({
    line: `${key}=${quoteIfNeeded(value, { single })}`,
    end: segments.length === 0 || trailingNewline ? end : '',
  })
  return joinSegments(segments)
}

/** Rewrites one line (keeps `export`, indentation and inline comment); refuses a readonly or non-variable line. */
export function updateVariable (text: string, line: number, key: string, value: string, { single }: QuoteOptions = {}): string {
  const segments = splitSegments(text)
  const lines = segments.map(segment => segment.line)
  const current = lines[line]
  const existing = current === undefined ? null : parseVariableLine(current)
  if (current === undefined || !existing || multilineEnd(lines, line) !== -1) {
    return text
  }
  const m = VARIABLE_LINE.exec(current)
  const prefix = /^\s*(?:export\s+)?/.exec(current)?.[0] ?? ''
  const keepSingle = single === undefined ? isSingleQuoted(current) : single
  const segment = segments[line]
  if (!segment || !m) {
    return text
  }
  segment.line = `${prefix}${key}=${quoteIfNeeded(value, { single: keepSingle })}${inlineComment(m[2] ?? '')}`
  return joinSegments(segments)
}

/** Drops only that line; refuses a readonly line or an index out of range. */
export function removeVariable (text: string, line: number): string {
  const segments = splitSegments(text)
  const lines = segments.map(segment => segment.line)
  if (line < 0 || line >= lines.length || multilineEnd(lines, line) !== -1) {
    return text
  }
  const [removed] = segments.splice(line, 1)
  // Dropping an unterminated last line leaves the new last line unterminated too.
  const newLast = segments.at(-1)
  if (removed && !removed.end && newLast) {
    newLast.end = ''
  }
  return joinSegments(segments)
}

/** True when another line (not `exceptLine`) already holds `key`. */
export function findDuplicateKey (text: string | null | undefined, key: string, exceptLine?: number): boolean {
  return listVariables(text).some(
    variable => variable.key === key && variable.line !== exceptLine,
  )
}

/**
 * Merges pasted `KEY=value` lines. A key repeated in the paste counts once (last value wins).
 * Existing keys are skipped unless `overwrite`, and then only the last line holding the key is rewritten.
 */
export function importVariables (text: string, pasted: string, { overwrite = false }: { overwrite?: boolean } = {}): ImportResult {
  const incoming = new Map<string, { value: string, single: boolean }>()
  for (const line of splitEnvLines(pasted).lines) {
    const variable = parseVariableLine(line)
    if (!variable) {
      continue
    }
    incoming.delete(variable.key)
    incoming.set(variable.key, { value: variable.value, single: isSingleQuoted(line) })
  }
  const lastByKey = new Map<string, EnvVariable>()
  for (const variable of listVariables(text)) {
    lastByKey.set(variable.key, variable)
  }
  let result = text || ''
  let added = 0
  let updated = 0
  let skipped = 0
  for (const [key, { value, single }] of incoming) {
    const existing = lastByKey.get(key)
    if (!existing) {
      result = addVariable(result, key, value, { single })
      added++
    } else if (overwrite && !existing.readonly) {
      result = updateVariable(result, existing.line, key, value, { single })
      updated++
    } else {
      skipped++
    }
  }
  if (added + updated === 0) {
    result = text
  }
  return { text: result, added, updated, skipped }
}
