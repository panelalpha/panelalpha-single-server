import type { DeployLogLine } from '@/entities/project/ui/deploy/deploy-log.types'
import { formatLineTimestamp } from '@/entities/project/ui/deploy/deploy-log-ui'

// Log lines (webserver and PHP pages from the API, deploy lines of one run) parsed into one row model for the
// logs table. Formats are from the engine templates; a line that matches no format keeps its whole
// text in `message`.

export type LogKind = 'access' | 'error' | 'php' | 'deploy'

/** Kinds read from a log file; deploy rows come from `deployRows`. */
export type FileLogKind = Exclude<LogKind, 'deploy'>

export interface LogRow {
  /** Unique within one parsed page (or one deploy run): the position of the entry in file order. */
  id: string
  /** The timestamp as written in the log, without timezone conversion; deploy lines use `formatLineTimestamp`. */
  time: string | null
  /** Position of the entry in file order (0 = oldest). Sorting by it is sorting by time, without ties inside one second. */
  sortKey: number
  ip?: string
  /** Access: the request line (`GET /x HTTP/1.1`). */
  request?: string
  /** Access: referer · user agent, without `-` values. */
  detail?: string
  /** Access: HTTP status code. */
  status?: string
  /** Access: response size in bytes as written (`-` when none). */
  size?: string
  /** Normalised level: `fatal`, `error`, `warning`, `notice`, `deprecated`, `info`, `debug`; deploy also `ok`; other values lower-cased. */
  level?: string
  /** Deploy: stage of the run. */
  stage?: string
  /** The main text of the row: access request line, error or PHP message (multi-line PHP entries joined with `\n`), deploy `msg`. */
  message: string
}

const PHP_FILE = 'php_error.log'

/** Kind of a log file from its name: `php_error.log` → php, `access*` / `*_access*` → access, `error*` / `*_error*` (and anything else) → error. */
export function logKindForFile (filename: string): FileLogKind {
  const name = (filename.split('/').pop() ?? filename).toLowerCase()
  if (name === PHP_FILE) {
    return 'php'
  }
  if (name.startsWith('access') || name.includes('_access')) {
    return 'access'
  }
  return 'error'
}

const LEVELS: Record<string, string> = {
  'emerg': 'fatal',
  'alert': 'fatal',
  'crit': 'fatal',
  'critical': 'fatal',
  'fatal': 'fatal',
  'fatal error': 'fatal',
  'parse error': 'fatal',
  'core error': 'fatal',
  'compile error': 'fatal',
  'error': 'error',
  'err': 'error',
  'recoverable fatal error': 'error',
  'catchable fatal error': 'error',
  'user error': 'error',
  'warn': 'warning',
  'warning': 'warning',
  'core warning': 'warning',
  'compile warning': 'warning',
  'user warning': 'warning',
  'notice': 'notice',
  'user notice': 'notice',
  'strict standards': 'notice',
  'deprecated': 'deprecated',
  'user deprecated': 'deprecated',
  'info': 'info',
  'debug': 'debug',
}

/** `PHP Warning` → `warning`, `WARN` → `warning`, `core:error` → `error`, Apache `trace3` → `debug`; unknown values lower-cased. */
export function normalizeLogLevel (level: string): string {
  const key = level.trim().toLowerCase().replace(/^php\s+/, '').replace(/^[\w-]+:/, '').replace(/\s+/g, ' ')
  if (/^trace\d$/.test(key)) {
    return 'debug'
  }
  return LEVELS[key] ?? key
}

type ParsedLine = Omit<LogRow, 'id' | 'sortKey'>

// NCSA combined: ip ident user [time] "request" status size "referer" "user agent" (referer and agent optional: common format).
const ACCESS = /^(\S+) \S+ \S+ \[([^\]]+)\] "((?:[^"\\]|\\.)*)" (\d{3}|-) (\d+|-)(?: "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)")?/

function parseAccess (line: string): ParsedLine | null {
  const match = ACCESS.exec(line)
  if (!match) {
    return null
  }
  const [, ip = '', time = '', request = '', status = '', size = '', referer, agent] = match
  const detail = [referer, agent].filter(value => value && value !== '-').join(' · ')
  return { time, ip, request, status, size, message: request, ...(detail ? { detail } : {}) }
}

// nginx: `2026/11/05 12:00:00 [error] 31#31: *5 message`.
const NGINX_ERROR = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (?:\d+#\d+: )?(?:\*\d+ )?(.*)$/
// Apache 2.4 (`[core:error]`, pid and client blocks) and 2.2 (`[error]`).
const APACHE_ERROR = /^\[(\w{3} \w{3} +\d{1,2} \d{2}:\d{2}:\d{2}(?:\.\d+)? \d{4})\] \[(?:[\w-]+:)?(\w+)\] (?:\[pid [^\]]*\] )?(?:\[client [^\]]*\] )?(.*)$/
// LiteSpeed: `2026-11-05 12:00:00.123 [ERROR] [123] [1.2.3.4:5678#a.example] message`.
const LITESPEED_ERROR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?) \[(\w+)\] (?:\[\d+\] )?(?:\[[^\]#]*#[^\]]*\] )?(.*)$/

function parseError (line: string): ParsedLine | null {
  const nginx = NGINX_ERROR.exec(line)
  if (nginx) {
    return { time: nginx[1] ?? null, level: normalizeLogLevel(nginx[2] ?? ''), message: nginx[3] ?? '' }
  }
  const apache = APACHE_ERROR.exec(line)
  if (apache) {
    return { time: apache[1] ?? null, level: normalizeLogLevel(apache[2] ?? ''), message: apache[3] ?? '' }
  }
  const litespeed = LITESPEED_ERROR.exec(line)
  if (litespeed) {
    return { time: litespeed[1] ?? null, level: normalizeLogLevel(litespeed[2] ?? ''), message: litespeed[3] ?? '' }
  }
  return null
}

// `[05-Nov-2026 12:00:00 UTC] PHP Warning:  message`; the timezone is optional.
const PHP_ENTRY = /^\[(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2}(?: [^\]]+)?)\] ?(.*)$/
const PHP_TYPE = /^(?:PHP )?((?:(?:Core|Compile|User|Recoverable|Catchable) )?(?:fatal error|error|warning|notice|deprecated)|Parse error|Strict Standards):(.*)$/i
// `PHP Stack trace:` and `PHP   1. {main}() /x.php:0` belong to the entry above them even with their own timestamp.
const PHP_STACK = /^PHP (?:Stack trace:|\s+\d+\. )/

function parsePhpEntry (time: string, body: string): ParsedLine {
  const typed = PHP_TYPE.exec(body)
  if (typed) {
    return { time, level: normalizeLogLevel(typed[1] ?? ''), message: (typed[2] ?? '').trimStart() }
  }
  return { time, message: body }
}

/** PHP entries: a line without a leading timestamp (or a timestamped stack trace line) continues the entry above it. */
function phpEntries (lines: string[]): ParsedLine[] {
  const entries: ParsedLine[] = []
  for (const line of lines) {
    const match = PHP_ENTRY.exec(line)
    const previous = entries.at(-1)
    const body = match ? (match[2] ?? '') : line
    if (previous && (!match || PHP_STACK.test(body))) {
      previous.message += `\n${body}`
      continue
    }
    entries.push(match ? parsePhpEntry(match[1] ?? '', body) : { time: null, message: line })
  }
  return entries
}

function plainLine (line: string): ParsedLine {
  return { time: null, message: line }
}

/**
 * Rows of one log page, newest first. `lines` come from the API in file order; PHP entries are grouped first and reversed after, so a
 * multi-line entry stays in one piece. Blank lines are skipped. The rows of a later (older) page get ids `<page>-<n>`, so the windows
 * appended one after another keep unique ids.
 */
export function parseLogPage (kind: FileLogKind, lines: readonly string[], page = 1): LogRow[] {
  const filled = lines.filter(line => line.trim() !== '')
  let entries: ParsedLine[]
  if (kind === 'php') {
    entries = phpEntries(filled)
  } else {
    const parse = kind === 'access' ? parseAccess : parseError
    entries = filled.map(line => parse(line) ?? plainLine(line))
  }
  const idOf = (index: number): string => page > 1 ? `${page}-${index}` : String(index)
  // eslint-disable-next-line unicorn/no-array-reverse -- `toReversed` is not in the app tsconfig lib (es2022); this reverses a fresh array
  return entries.map((entry, index) => ({ ...entry, id: idOf(index), sortKey: index })).reverse()
}

/** Rows of one deploy run, newest first; the time is local like the deploy console (`formatLineTimestamp`), `null` without `ts`. */
export function deployRows (lines: readonly DeployLogLine[]): LogRow[] {
  const rows = lines.map((line, index): LogRow => {
    const row: LogRow = {
      id: String(index),
      time: Number(line.ts) ? formatLineTimestamp(line.ts) : null,
      sortKey: index,
      message: line.msg ?? '',
    }
    if (line.stage) {
      row.stage = line.stage
    }
    if (line.level) {
      row.level = normalizeLogLevel(line.level)
    }
    return row
  })
  // eslint-disable-next-line unicorn/no-array-reverse -- `toReversed` is not in the app tsconfig lib (es2022); this reverses a fresh array
  return rows.reverse()
}
