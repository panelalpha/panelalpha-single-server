import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ErrorReport,
  markErrorHandled,
  redactText,
  reportError,
  resetErrorReporting,
  setErrorReporter,
} from './report-error'

function httpError (status: number | undefined, url = '/instances/12/backups?token=abc123&page=2'): AxiosError {
  const config = { method: 'get', url, headers: { Authorization: 'Bearer secret-value' }, data: '{"password":"hunter2"}' } as unknown as InternalAxiosRequestConfig
  const response = status === undefined
    ? undefined
    : { status, statusText: '', headers: {}, config, data: { message: 'x@example.com' } }
  return new AxiosError(
    status === undefined ? 'Network Error' : `Request failed with status code ${status}`,
    status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE',
    config,
    {},
    response,
  )
}

describe('report-error', () => {
  const reports: ErrorReport[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'))
    resetErrorReporting()
    reports.length = 0
    setErrorReporter(report => {
      reports.push(report)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetErrorReporting()
  })

  describe('default reporter', () => {
    it('writes the report to console.error', () => {
      setErrorReporter(null)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(reportError(new TypeError('boom'), { source: 'window' })).toBe(true)

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toBe('[window] TypeError: boom')
      expect(spy.mock.calls[0]?.[1]).toMatchObject({ source: 'window', name: 'TypeError', message: 'boom' })
    })

    it('is restored by setErrorReporter(null)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      setErrorReporter(null)

      reportError(new Error('back to default'))

      expect(reports).toHaveLength(0)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('custom reporter', () => {
    it('receives the normalized report with context', () => {
      const error = new RangeError('out of range')

      reportError(error, { source: 'vue', componentName: 'InstancesView', info: 'mounted hook', routeName: 'instances' })

      expect(reports).toHaveLength(1)
      expect(reports[0]).toMatchObject({
        source: 'vue',
        name: 'RangeError',
        message: 'out of range',
        componentName: 'InstancesView',
        info: 'mounted hook',
        routeName: 'instances',
      })
      expect(reports[0]?.stack).toContain('out of range')
    })

    it('defaults the source to manual', () => {
      reportError(new Error('x'))

      expect(reports[0]?.source).toBe('manual')
    })

    it('reports strings and non-error values without their contents', () => {
      reportError('plain failure')
      reportError({ user: { email: 'jan@example.com' }, password: 'hunter2' })
      reportError(undefined)
      reportError(null)

      expect(reports.map(report => report.message)).toEqual([
        'plain failure',
        'Non-error value thrown (object)',
        'Non-error value thrown (undefined)',
        'Non-error value thrown (null)',
      ])
      expect(JSON.stringify(reports)).not.toContain('jan@example.com')
      expect(JSON.stringify(reports)).not.toContain('hunter2')
    })

    it('accepts an error-like object from another realm', () => {
      reportError({ name: 'DOMException', message: 'The operation was aborted' })

      expect(reports[0]).toMatchObject({ name: 'DOMException', message: 'The operation was aborted' })
    })

    it('truncates long messages and stacks', () => {
      const error = new Error('m'.repeat(2000))
      error.stack = `Error: m\n${'    at x (file.ts:1:1)\n'.repeat(500)}`

      reportError(error)

      expect(reports[0]?.message.length).toBeLessThanOrEqual(501)
      expect(reports[0]?.stack?.length).toBeLessThanOrEqual(4001)
    })

    it('can be replaced again', () => {
      const second: ErrorReport[] = []
      setErrorReporter(report => {
        second.push(report)
      })

      reportError(new Error('to the second'))

      expect(reports).toHaveLength(0)
      expect(second).toHaveLength(1)
    })
  })

  describe('errors that are not reported', () => {
    it.each([401, 422])('skips an HTTP %i', status => {
      expect(reportError(httpError(status))).toBe(false)
      expect(reports).toHaveLength(0)
    })

    it.each([400, 403, 404, 500, 503])('reports an HTTP %i', status => {
      expect(reportError(httpError(status))).toBe(true)
      expect(reports[0]?.http?.status).toBe(status)
    })

    it('reports a network error (no response)', () => {
      reportError(httpError(undefined))

      expect(reports[0]?.http).toMatchObject({ code: 'ERR_NETWORK', method: 'GET' })
      expect(reports[0]?.http?.status).toBeUndefined()
    })

    it('skips cancelled requests and aborts', () => {
      const cancelled = new AxiosError('canceled', 'ERR_CANCELED')
      const aborted = new DOMException('aborted', 'AbortError')

      expect(reportError(cancelled)).toBe(false)
      expect(reportError(aborted)).toBe(false)
      expect(reports).toHaveLength(0)
    })

    it('skips the benign ResizeObserver notification', () => {
      expect(reportError(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false)
      expect(reportError('ResizeObserver loop limit exceeded')).toBe(false)
      expect(reports).toHaveLength(0)
    })

    it('skips an error marked as handled', () => {
      const error = new Error('shown in an alert')
      markErrorHandled(error)

      expect(reportError(error)).toBe(false)
      expect(reports).toHaveLength(0)
    })

    it('ignores marking a primitive', () => {
      markErrorHandled('text')

      expect(reportError('text')).toBe(true)
    })
  })

  describe('privacy', () => {
    it('keeps no request config, query string, headers or body of an HTTP error', () => {
      reportError(httpError(500))

      const serialized = JSON.stringify(reports[0])
      expect(reports[0]?.http).toEqual({
        status: 500,
        code: 'ERR_BAD_RESPONSE',
        method: 'GET',
        path: '/instances/12/backups',
      })
      for (const secret of ['abc123', 'secret-value', 'hunter2', 'x@example.com', 'token=']) {
        expect(serialized).not.toContain(secret)
      }
    })

    it('redacts the request path of tokens', () => {
      reportError(httpError(500, `/invitations/${'a1b2c3d4'.repeat(8)}/accept`))

      expect(reports[0]?.http?.path).toBe('/invitations/[token]/accept')
    })

    it('redacts e-mail addresses, tokens and credentials from message and stack', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF123_-xyz'
      const error = new Error(`Failed for jan.kowalski@example.com with Bearer ${jwt} and password=hunter2`)
      error.stack = `Error: ${error.message}\n    at load (http://localhost:5173/src/a.ts?t=1700000000:10:5)`

      reportError(error)

      const serialized = JSON.stringify(reports[0])
      for (const secret of ['jan.kowalski', 'example.com', jwt, 'hunter2', 't=1700000000']) {
        expect(serialized).not.toContain(secret)
      }
      expect(reports[0]?.message).toBe('Failed for [email] with Bearer [token] and password=[redacted]')
      expect(reports[0]?.stack).toContain('http://localhost:5173/src/a.ts:10:5')
    })

    it('redacts the context fields too', () => {
      reportError(new Error('x'), { info: 'handler for jan@example.com' })

      expect(reports[0]?.info).toBe('handler for [email]')
    })
  })

  describe('redactText', () => {
    it.each([
      ['https://panel.example.com/reset?token=abc&email=a@b.co#frag', 'https://panel.example.com/reset'],
      ['https://user:pass@host.example.com/x', 'https://host.example.com/x'],
      ['GET /api/callback?code=12345&state=xyz failed', 'GET /api/callback?[query] failed'],
      ['{"password":"hunter2","name":"Jan"}', '{"password":"[redacted]","name":"Jan"}'],
      ['authorization: Basic dXNlcjpwYXNz', 'authorization: [redacted] dXNlcjpwYXNz'],
      ['reset token 0123456789abcdef0123456789abcdef used', 'reset token [token] used'],
      ['Request failed with status code 500', 'Request failed with status code 500'],
      ['Really?! Error #5 on page', 'Really?! Error #5 on page'],
    ])('%s', (input, expected) => {
      expect(redactText(input)).toBe(expected)
    })
  })

  describe('duplicates', () => {
    it('reports the same error object once', () => {
      const error = new Error('seen twice')

      expect(reportError(error, { source: 'unhandledrejection' })).toBe(true)
      expect(reportError(error, { source: 'window' })).toBe(false)
      expect(reports).toHaveLength(1)
      expect(reports[0]?.source).toBe('unhandledrejection')
    })

    it('reports an equal error from another object once inside the window', () => {
      const raise = () => new Error('same text')

      expect(reportError(raise())).toBe(true)
      vi.advanceTimersByTime(1000)
      expect(reportError(raise())).toBe(false)
      expect(reports).toHaveLength(1)
    })

    it('reports it again after the window', () => {
      const raise = () => new Error('later')
      reportError(raise())
      vi.advanceTimersByTime(2500)

      expect(reportError(raise())).toBe(true)
      expect(reports).toHaveLength(2)
    })

    it('does not merge different errors', () => {
      reportError(new Error('one'))
      reportError(new Error('two'))
      reportError('one')

      expect(reports).toHaveLength(3)
    })

    it('does not merge the same HTTP failure of different requests', () => {
      const failing = (url: string) => httpError(500, url)

      reportError(failing('/instances/1/backups'))
      reportError(failing('/instances/2/backups'))
      reportError(failing('/instances/1/backups'))

      expect(reports.map(report => report.http?.path)).toEqual(['/instances/1/backups', '/instances/2/backups'])
    })

    it('does not merge the same text from different places', () => {
      const first = new Error('same text, other place')
      first.stack = 'Error: same text, other place\n    at a (a.ts:1:1)'
      const second = new Error('same text, other place')
      second.stack = 'Error: same text, other place\n    at b (b.ts:2:2)'

      reportError(first)
      reportError(second)

      expect(reports).toHaveLength(2)
    })

    it('keeps its memory bounded', () => {
      for (let index = 0; index < 250; index += 1) {
        reportError(`failure ${index}`)
      }

      expect(reports).toHaveLength(250)
    })
  })

  describe('a failing reporter', () => {
    it('does not throw out of reportError', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      setErrorReporter(() => {
        throw new Error('tool is down for jan@example.com')
      })

      expect(reportError(new Error('x'))).toBe(false)

      expect(spy).toHaveBeenCalledWith('[error-reporter] reporter failed:', 'tool is down for [email]')
    })

    it('keeps working for the next error', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      let fail = true
      setErrorReporter(report => {
        if (fail) {
          throw new Error('once')
        }
        reports.push(report)
      })

      reportError(new Error('first'))
      fail = false

      expect(reportError(new Error('second'))).toBe(true)
      expect(reports).toHaveLength(1)
    })

    it('ignores an error reported from inside the reporter', () => {
      setErrorReporter(report => {
        reports.push(report)
        reportError(new Error('from the reporter'))
      })

      reportError(new Error('outer'))

      expect(reports.map(report => report.message)).toEqual(['outer'])
    })
  })
})
