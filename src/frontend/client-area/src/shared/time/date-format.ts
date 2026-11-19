// Without `moment`: the local parts of a `Date` stand in for the
// `YYYY`, `MM` and `DD` tokens. Only the four formats the lite settings allow; anything else falls back to `YYYY-MM-DD`, as legacy does.
import { parseDate } from './format-date'

export const DATE_FORMATS = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'] as const

export type DateFormat = typeof DATE_FORMATS[number]

export const DEFAULT_DATE_FORMAT: DateFormat = 'YYYY-MM-DD'

/** `'—'`: the answer for an empty or unparsable value. */
export const EMPTY_DATE = '—'

export type DateValue = string | number | Date | null | undefined

export interface FormatDateOptions {
  /** Appends ` HH:mm` after the date. */
  time?: boolean
  /** One of `DATE_FORMATS`; anything else (or nothing) means `YYYY-MM-DD`. */
  format?: string
}

function pad (value: number): string {
  return String(value).padStart(2, '0')
}

function isDateFormat (value: unknown): value is DateFormat {
  return (DATE_FORMATS as readonly unknown[]).includes(value)
}

function toDate (value: DateValue): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  const text = typeof value === 'string' ? value.trim() : value
  if (text === '') {
    return null
  }
  // The backup rows carry epoch milliseconds as a digit string (legacy `${date}000`), which `parseDate` would not read as a time.
  const date = typeof text === 'string' && /^\d+$/.test(text) ? new Date(Number(text)) : parseDate(text)
  return Number.isNaN(date.getTime()) ? null : date
}

const PATTERNS: Record<DateFormat, (year: string, month: string, day: string) => string> = {
  'YYYY-MM-DD': (year, month, day) => `${year}-${month}-${day}`,
  'DD.MM.YYYY': (year, month, day) => `${day}.${month}.${year}`,
  'DD/MM/YYYY': (year, month, day) => `${day}/${month}/${year}`,
  'MM/DD/YYYY': (year, month, day) => `${month}/${day}/${year}`,
}

/** The date in the configured format, `HH:mm` appended with `time`. */
export function formatDate (value: DateValue, options: FormatDateOptions = {}): string {
  const date = toDate(value)
  if (!date) {
    return EMPTY_DATE
  }
  const format = isDateFormat(options.format) ? options.format : DEFAULT_DATE_FORMAT
  const day = PATTERNS[format](String(date.getFullYear()), pad(date.getMonth() + 1), pad(date.getDate()))
  return options.time ? `${day} ${formatTime(date)}` : day
}

/** Local time `HH:mm`. `'—'` for an empty or unparsable value. */
export function formatTime (value: DateValue): string {
  const date = toDate(value)
  if (!date) {
    return EMPTY_DATE
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
