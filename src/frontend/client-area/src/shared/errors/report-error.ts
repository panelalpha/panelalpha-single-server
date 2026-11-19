/**
 * The one place every unhandled front-end error goes to.
 *
 * `src/app/plugins/error-handlers.ts` feeds it from `app.config.errorHandler`, `window` `error` and `unhandledrejection`; code that
 * catches an error it cannot show to the user may call `reportError` itself. What happens with a report is decided by the reporter:
 * the default one writes to `console.error`. To plug in a monitoring tool, call `setErrorReporter(report => tool.capture(report))`
 * once at boot (`src/main.ts`); nothing else in the app knows which tool it is.
 *
 * The report holds only fields that are safe to leave the browser: no request config, headers, body, query string, route params,
 * e-mail addresses or tokens (see `redactText`). Errors the user already saw (HTTP 401 and 422), cancelled requests and
 * errors marked with `markErrorHandled` are not reported. The same error is reported once.
 */

import { isApiError } from '@/shared/api/error-message'

export type ErrorSource = 'vue' | 'window' | 'unhandledrejection' | 'manual'

/** HTTP facts of an axios error. `path` is the request path without query string or hash. */
export interface ErrorReportHttp {
  status?: number
  code?: string
  method?: string
  path?: string
}

export interface ErrorReport {
  source: ErrorSource
  name: string
  message: string
  stack?: string
  /** Name of the Vue component that threw (`app.config.errorHandler` only). */
  componentName?: string
  /** Vue's description of where it happened, e.g. `mounted hook`. */
  info?: string
  /** Route name (never the path, params or query: they carry tokens in invite and reset links). */
  routeName?: string
  http?: ErrorReportHttp
}

export interface ErrorReportContext {
  source?: ErrorSource
  componentName?: string
  info?: string
  routeName?: string
}

export type ErrorReporter = (report: ErrorReport) => void

const MAX_MESSAGE_LENGTH = 500
const MAX_STACK_LENGTH = 4000
const MAX_LABEL_LENGTH = 120
/** The same fingerprint inside this window is reported once (a render error that repeats on every frame, the same error seen by two channels). */
const DEDUP_WINDOW_MS = 2000
const MAX_REMEMBERED_FINGERPRINTS = 100
/** Statuses the user already saw: 401 leads to the login page (`src/shared/api/client.ts`), 422 is shown as a validation message. */
const HANDLED_HTTP_STATUSES = new Set([401, 422])

const SECRET_KEYS = 'password|passwd|pwd|token|secret|authorization|api[_-]?key|csrf|xsrf'

/** Order matters: URLs lose their query first, then loose secrets are matched in what is left. */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string | ((match: string) => string)]> = [
  [/\/\/[^/@\s"'<>]+@/g, '//'],
  [/\bhttps?:\/\/[^\s"'<>()]+/g, sanitizeUrl],
  [/\?[\w%.~-]+=[^\s"'<>)#]*/g, '?[query]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [token]'],
  [new RegExp(String.raw`\b(${SECRET_KEYS})(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+`, 'gi'), '$1$2[redacted]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[A-F0-9]{32,}\b/gi, '[token]'],
  [/\b[\w-]{40,}\b/g, '[token]'],
]

/** Cuts query and hash off an absolute URL but keeps a trailing `:line:column` (stack frames). */
function sanitizeUrl (url: string): string {
  const position = /(?::\d+){1,2}$/.exec(url)?.[0] ?? ''
  const bare = position ? url.slice(0, -position.length) : url
  const cut = bare.search(/[?#]/)
  return (cut === -1 ? bare : bare.slice(0, cut)) + position
}

/** Removes tokens, e-mail addresses, credentials and URL query strings from free text. Exported for tests and for reporters that add their own fields. */
export function redactText (text: string): string {
  let result = text
  for (const [pattern, replacement] of REDACTIONS) {
    result = typeof replacement === 'string' ? result.replace(pattern, replacement) : result.replace(pattern, replacement)
  }
  return result
}

function truncate (text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function safeText (value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined
  }
  return truncate(redactText(value), max)
}

const handledErrors = new WeakSet<object>()

/**
 * Tell the reporter that this error object was already shown to the user (an alert, a form message) and is only thrown on.
 * Primitive values cannot be marked.
 */
export function markErrorHandled (error: unknown): void {
  if (isObject(error)) {
    handledErrors.add(error)
  }
}

function isObject (value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

interface ErrorLike {
  name?: unknown
  message?: unknown
  stack?: unknown
  code?: unknown
}

function describeHttp (error: object): ErrorReportHttp {
  const { response, config, code } = error as {
    response?: { status?: unknown }
    config?: { method?: unknown, url?: unknown }
    code?: unknown
  }
  const http: ErrorReportHttp = {}
  if (typeof response?.status === 'number') {
    http.status = response.status
  }
  if (typeof code === 'string') {
    http.code = code
  }
  if (typeof config?.method === 'string') {
    http.method = config.method.toUpperCase()
  }
  if (typeof config?.url === 'string') {
    http.path = truncate(redactText(config.url.split(/[?#]/, 1)[0] ?? ''), MAX_MESSAGE_LENGTH)
  }
  return http
}

function isCancelled (error: unknown): boolean {
  if (!isObject(error)) {
    return false
  }
  const { name, code } = error as ErrorLike
  return code === 'ERR_CANCELED' || name === 'CanceledError' || name === 'AbortError'
}

/** Why an error is not reported, or `undefined` when it is. */
function skipReason (error: unknown): string | undefined {
  if (isObject(error) && handledErrors.has(error)) {
    return 'handled'
  }
  if (isApiError(error)) {
    const status = (error as { response?: { status?: unknown } }).response?.status
    if (typeof status === 'number' && HANDLED_HTTP_STATUSES.has(status)) {
      return 'handled-http'
    }
  }
  if (isCancelled(error)) {
    return 'cancelled'
  }
  const message = isObject(error) ? (error as ErrorLike).message : error
  // A benign browser notification, not a failure of the app.
  if (typeof message === 'string' && message.startsWith('ResizeObserver loop')) {
    return 'benign'
  }
  return undefined
}

function buildReport (error: unknown, context: ErrorReportContext): ErrorReport {
  const report: ErrorReport = {
    source: context.source ?? 'manual',
    name: 'NonErrorThrown',
    message: '',
  }

  if (isObject(error) && typeof (error as ErrorLike).message === 'string') {
    const { name, message, stack } = error as ErrorLike
    report.name = safeText(name, MAX_LABEL_LENGTH) ?? 'Error'
    report.message = truncate(redactText(message as string), MAX_MESSAGE_LENGTH)
    const safeStack = safeText(stack, MAX_STACK_LENGTH)
    if (safeStack) {
      report.stack = safeStack
    }
    if (isApiError(error)) {
      report.http = describeHttp(error)
    }
  } else if (typeof error === 'string') {
    report.message = truncate(redactText(error), MAX_MESSAGE_LENGTH)
  } else {
    // Objects can hold anything (forms, users); say what it was, not what it contained.
    report.message = `Non-error value thrown (${error === null ? 'null' : typeof error})`
  }

  const componentName = safeText(context.componentName, MAX_LABEL_LENGTH)
  const info = safeText(context.info, MAX_LABEL_LENGTH)
  const routeName = safeText(context.routeName, MAX_LABEL_LENGTH)
  if (componentName) {
    report.componentName = componentName
  }
  if (info) {
    report.info = info
  }
  if (routeName) {
    report.routeName = routeName
  }
  return report
}

function firstStackFrame (stack: string | undefined): string {
  return stack?.split('\n').find(line => /^\s*at\s|@/.test(line))?.trim() ?? ''
}

function defaultReporter (report: ErrorReport): void {
  console.error(`[${report.source}] ${report.name}: ${report.message}`, report)
}

let reporter: ErrorReporter = defaultReporter
let delivering = false
let reportedErrors = new WeakSet<object>()
const recentFingerprints = new Map<string, number>()

/** Replaces the reporter (a monitoring tool adapter). `null` restores the default `console.error` one. */
export function setErrorReporter (next: ErrorReporter | null): void {
  reporter = next ?? defaultReporter
}

/** Back to the default reporter with an empty memory of reported errors. For tests. */
export function resetErrorReporting (): void {
  reporter = defaultReporter
  delivering = false
  recentFingerprints.clear()
  reportedErrors = new WeakSet<object>()
}

function isDuplicate (error: unknown, report: ErrorReport): boolean {
  if (isObject(error)) {
    if (reportedErrors.has(error)) {
      return true
    }
    reportedErrors.add(error)
  }

  const now = Date.now()
  for (const [key, at] of recentFingerprints) {
    if (now - at > DEDUP_WINDOW_MS) {
      recentFingerprints.delete(key)
    }
  }
  // The request is part of the identity: two endpoints failing with the same status share message and first stack frame.
  const { status, code, method, path } = report.http ?? {}
  const fingerprint = [report.name, report.message, firstStackFrame(report.stack), status, code, method, path].join('|')
  if (recentFingerprints.has(fingerprint)) {
    return true
  }
  if (recentFingerprints.size >= MAX_REMEMBERED_FINGERPRINTS) {
    const oldest = recentFingerprints.keys().next().value
    if (oldest !== undefined) {
      recentFingerprints.delete(oldest)
    }
  }
  recentFingerprints.set(fingerprint, now)
  return false
}

/**
 * Reports one unhandled error to the active reporter. Never throws and never reports from inside a reporter.
 * Returns whether a report was delivered (false: skipped as handled, duplicate or re-entrant).
 */
export function reportError (error: unknown, context: ErrorReportContext = {}): boolean {
  if (delivering) {
    return false
  }
  try {
    if (skipReason(error) !== undefined) {
      return false
    }
    const report = buildReport(error, context)
    if (isDuplicate(error, report)) {
      return false
    }

    delivering = true
    try {
      reporter(report)
    } finally {
      delivering = false
    }
    return true
  } catch (error_) {
    // The error path must not become an error source: a broken reporter is logged and dropped.
    try {
      console.error('[error-reporter] reporter failed:', redactText(error_ instanceof Error ? error_.message : String(error_)))
    } catch {
      // Nothing left to do.
    }
    return false
  }
}
