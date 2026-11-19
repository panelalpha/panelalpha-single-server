import { describe, expect, it } from 'vitest'
import { formatLineTimestamp } from '@/entities/project/ui/deploy/deploy-log-ui'
import { deployRows, logKindForFile, normalizeLogLevel, parseLogPage } from './log-lines'

const ACCESS = '1.2.3.4 - - [05/Nov/2026:12:00:00 +0000] "GET /x HTTP/1.1" 200 512 "https://ref/" "Mozilla/5.0"'
const NGINX = '2026/11/05 12:00:00 [error] 31#31: *5 open() "/var/www/x" failed (2: No such file or directory), client: 1.2.3.4, '
  + 'server: a.example, request: "GET /x HTTP/1.1", host: "a.example"'
const APACHE = '[Wed Nov 05 12:00:00.123456 2026] [core:error] [pid 12:tid 34] [client 1.2.3.4:5678] AH00128: File does not exist: /x'
const LITESPEED = '2026-11-05 12:00:00.123 [ERROR] [123] [1.2.3.4:5678#a.example] msg'
const PHP = '[05-Nov-2026 12:00:00 UTC] PHP Warning:  msg in /var/www/html/x.php on line 3'

describe('log-lines logKindForFile', () => {
  it('reads the kind from the file name', () => {
    expect(logKindForFile('php_error.log')).toBe('php')
    expect(logKindForFile('access.log')).toBe('access')
    expect(logKindForFile('access-2026-11-01-00-00-00.log.gz')).toBe('access')
    expect(logKindForFile('nginx_access.log')).toBe('access')
    expect(logKindForFile('apache_access_ssl.log')).toBe('access')
    expect(logKindForFile('error.log')).toBe('error')
    expect(logKindForFile('nginx_error.log')).toBe('error')
    expect(logKindForFile('ERROR.LOG')).toBe('error')
  })

  it('falls back to error for an unknown name', () => {
    expect(logKindForFile('other.log')).toBe('error')
  })
})

describe('log-lines normalizeLogLevel', () => {
  it('maps the webserver, PHP and deploy levels to one set', () => {
    expect(normalizeLogLevel('error')).toBe('error')
    expect(normalizeLogLevel('ERROR')).toBe('error')
    expect(normalizeLogLevel('core:error')).toBe('error')
    expect(normalizeLogLevel('warn')).toBe('warning')
    expect(normalizeLogLevel('PHP Warning')).toBe('warning')
    expect(normalizeLogLevel('PHP Fatal error')).toBe('fatal')
    expect(normalizeLogLevel('Parse error')).toBe('fatal')
    expect(normalizeLogLevel('crit')).toBe('fatal')
    expect(normalizeLogLevel('Notice')).toBe('notice')
    expect(normalizeLogLevel('Deprecated')).toBe('deprecated')
    expect(normalizeLogLevel('trace3')).toBe('debug')
    expect(normalizeLogLevel('ok')).toBe('ok')
    expect(normalizeLogLevel('Custom')).toBe('custom')
  })
})

describe('log-lines parseLogPage access', () => {
  it('parses the combined format with referer · user agent as detail', () => {
    expect(parseLogPage('access', [ACCESS])).toEqual([{
      id: '0',
      sortKey: 0,
      time: '05/Nov/2026:12:00:00 +0000',
      ip: '1.2.3.4',
      request: 'GET /x HTTP/1.1',
      status: '200',
      size: '512',
      detail: 'https://ref/ · Mozilla/5.0',
      message: 'GET /x HTTP/1.1',
    }])
  })

  it('skips "-" referer and user agent', () => {
    const [noReferer] = parseLogPage('access', ['1.2.3.4 - - [05/Nov/2026:12:00:00 +0000] "GET / HTTP/1.1" 304 - "-" "curl/8"'])
    const [none] = parseLogPage('access', ['1.2.3.4 - - [05/Nov/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 1 "-" "-"'])

    expect(noReferer?.detail).toBe('curl/8')
    expect(noReferer?.size).toBe('-')
    expect(none).not.toHaveProperty('detail')
  })

  it('keeps escaped quotes inside the request and parses the common format', () => {
    const [escaped] = parseLogPage('access', [String.raw`::1 - - [05/Nov/2026:12:00:00 +0000] "GET /a\"b HTTP/1.1" 400 0 "-" "x"`])
    const [common] = parseLogPage('access', ['1.2.3.4 - bob [05/Nov/2026:12:00:00 +0000] "POST /y HTTP/2.0" 201 7'])

    expect(escaped?.request).toBe(String.raw`GET /a\"b HTTP/1.1`)
    expect(escaped?.ip).toBe('::1')
    expect(common).toMatchObject({ request: 'POST /y HTTP/2.0', status: '201', size: '7' })
    expect(common).not.toHaveProperty('detail')
  })

  it('keeps a line that matches no format as the whole message', () => {
    expect(parseLogPage('access', ['garbage line'])).toEqual([{ id: '0', sortKey: 0, time: null, message: 'garbage line' }])
  })
})

describe('log-lines parseLogPage error', () => {
  it('parses nginx', () => {
    expect(parseLogPage('error', [NGINX])).toEqual([{
      id: '0',
      sortKey: 0,
      time: '2026/11/05 12:00:00',
      level: 'error',
      message: 'open() "/var/www/x" failed (2: No such file or directory), client: 1.2.3.4, server: a.example, '
        + 'request: "GET /x HTTP/1.1", host: "a.example"',
    }])
  })

  it('parses Apache 2.4 and 2.2', () => {
    const [apache24] = parseLogPage('error', [APACHE])
    const [apache22] = parseLogPage('error', ['[Wed Nov 05 12:00:00 2026] [warn] [client 1.2.3.4] old format'])

    expect(apache24).toMatchObject({
      time: 'Wed Nov 05 12:00:00.123456 2026',
      level: 'error',
      message: 'AH00128: File does not exist: /x',
    })
    expect(apache22).toMatchObject({ time: 'Wed Nov 05 12:00:00 2026', level: 'warning', message: 'old format' })
  })

  it('parses LiteSpeed', () => {
    expect(parseLogPage('error', [LITESPEED])).toEqual([{
      id: '0',
      sortKey: 0,
      time: '2026-11-05 12:00:00.123',
      level: 'error',
      message: 'msg',
    }])
  })

  it('returns rows newest first with ids in file order and skips blank lines', () => {
    const rows = parseLogPage('error', [
      '2026/11/05 12:00:00 [notice] 1#1: first',
      '',
      'not a log line',
      '2026/11/05 12:00:02 [warn] 1#1: last',
    ])

    expect(rows.map(row => [row.id, row.sortKey, row.level, row.message])).toEqual([
      ['2', 2, 'warning', 'last'],
      ['1', 1, undefined, 'not a log line'],
      ['0', 0, 'notice', 'first'],
    ])
    expect(rows[1]?.time).toBeNull()
  })

  it('gives no rows for an empty page', () => {
    expect(parseLogPage('error', [])).toEqual([])
  })
})

describe('log-lines parseLogPage php', () => {
  it('parses the entry with the level and the message', () => {
    expect(parseLogPage('php', [PHP])).toEqual([{
      id: '0',
      sortKey: 0,
      time: '05-Nov-2026 12:00:00 UTC',
      level: 'warning',
      message: 'msg in /var/www/html/x.php on line 3',
    }])
  })

  it('groups the stack trace and lines without a timestamp before reversing', () => {
    const rows = parseLogPage('php', [
      '[05-Nov-2026 11:59:00 UTC] PHP Notice:  older',
      PHP,
      '[05-Nov-2026 12:00:00 UTC] PHP Stack trace:',
      '[05-Nov-2026 12:00:00 UTC] PHP   1. {main}() /x.php:0',
      '[05-Nov-2026 12:01:00 UTC] PHP Fatal error:  Uncaught Exception: boom in /x.php:3',
      'Stack trace:',
      '#0 {main}',
      '  thrown in /x.php on line 3',
    ])

    expect(rows.map(row => [row.id, row.level, row.message])).toEqual([
      ['2', 'fatal', 'Uncaught Exception: boom in /x.php:3\nStack trace:\n#0 {main}\n  thrown in /x.php on line 3'],
      ['1', 'warning', 'msg in /var/www/html/x.php on line 3\nPHP Stack trace:\nPHP   1. {main}() /x.php:0'],
      ['0', 'notice', 'older'],
    ])
  })

  it('keeps continuation lines at the top of the window as their own row', () => {
    const rows = parseLogPage('php', ['#1 /x.php(3): f()', PHP])

    expect(rows.map(row => [row.time, row.message])).toEqual([
      ['05-Nov-2026 12:00:00 UTC', 'msg in /var/www/html/x.php on line 3'],
      [null, '#1 /x.php(3): f()'],
    ])
  })

  it('keeps a timestamped line without a PHP type as the message without a level', () => {
    const [row] = parseLogPage('php', ['[05-Nov-2026 12:00:00 UTC] WordPress database error Table missing'])

    expect(row).toEqual({ id: '0', sortKey: 0, time: '05-Nov-2026 12:00:00 UTC', message: 'WordPress database error Table missing' })
  })
})

describe('log-lines deployRows', () => {
  it('maps deploy lines newest first with the console time', () => {
    const rows = deployRows([
      { ts: 1_762_344_000, stage: 'build', level: 'info', msg: 'start' },
      { ts: '1762344001', stage: 'build', level: 'warn', msg: 'slow' },
      { ts: 1_762_344_001, stage: 'release', level: 'ok', msg: 'done' },
    ])

    expect(rows).toEqual([
      { id: '2', sortKey: 2, time: formatLineTimestamp(1_762_344_001), stage: 'release', level: 'ok', message: 'done' },
      { id: '1', sortKey: 1, time: formatLineTimestamp('1762344001'), stage: 'build', level: 'warning', message: 'slow' },
      { id: '0', sortKey: 0, time: formatLineTimestamp(1_762_344_000), stage: 'build', level: 'info', message: 'start' },
    ])
  })

  it('keeps a line without ts, stage, level or msg', () => {
    expect(deployRows([{ ts: null, stage: null, level: null, msg: null }]))
      .toEqual([{ id: '0', sortKey: 0, time: null, message: '' }])
  })
})
