import type { InstallationDetails } from './installation-details'
import { describe, expect, it } from 'vitest'
import { redisRows } from './installation-details'

const base: InstallationDetails = {
  directory: '/var/www/site',
  database_name: 'wp_db',
  database_user: 'wp_user',
  database_password: 'secret',
  database_host: 'localhost',
  redis_host: null,
  redis_port: null,
  redis_password: null,
}

describe('redisRows', () => {
  it('returns no rows without a redis host', () => {
    expect(redisRows(base)).toEqual([])
  })

  it('returns no rows for an empty redis host, even with a port and password set', () => {
    expect(redisRows({ ...base, redis_host: '', redis_port: 6380, redis_password: 'pw' })).toEqual([])
  })

  it('returns host, port and password for a redis instance', () => {
    expect(redisRows({ ...base, redis_host: '10.0.0.5', redis_port: 6380, redis_password: 'pw' })).toEqual([
      { field: 'host', value: '10.0.0.5' },
      { field: 'port', value: 6380 },
      { field: 'password', value: 'pw' },
    ])
  })

  it('falls back to port 6379 when the port is empty', () => {
    expect(redisRows({ ...base, redis_host: 'redis', redis_port: null })[1]).toEqual({ field: 'port', value: '6379' })
  })

  it('returns a null password when none is set', () => {
    expect(redisRows({ ...base, redis_host: 'redis', redis_password: '' })[2]).toEqual({ field: 'password', value: null })
    expect(redisRows({ ...base, redis_host: 'redis', redis_password: null })[2]).toEqual({ field: 'password', value: null })
  })

  it('treats missing details as no rows', () => {
    expect(redisRows({})).toEqual([])
  })
})
