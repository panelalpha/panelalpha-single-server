import { describe, expect, it } from 'vitest'
import { initialDriver, initialValues, STORE_FIELDS, storePayload } from './backup-store-fields'

const DRIVERS = ['local', 's3', 'sftp', 'ftp', 'ftps']
const store = (driver: string, location = '/x') => ({ id: 1, name: 'S', driver, location })

describe('initialDriver', () => {
  it('uses the current driver when known and offered', () => {
    expect(initialDriver(store('s3'), DRIVERS)).toBe('s3')
  })

  it('falls back to local without a store, for an unknown driver or one the Engine does not offer', () => {
    expect(initialDriver(null, DRIVERS)).toBe('local')
    expect(initialDriver(store('azure'), [...DRIVERS, 'azure'])).toBe('local')
    expect(initialDriver(store('s3'), ['local'])).toBe('local')
  })
})

describe('STORE_FIELDS', () => {
  it('shares the FTP fields with FTPS', () => {
    expect(STORE_FIELDS.ftps).toBe(STORE_FIELDS.ftp)
  })
})

describe('initialValues', () => {
  it('local starts with the default location', () => {
    expect(initialValues('local', null, '/opt/b')).toEqual({ location: '/opt/b' })
  })

  it('s3 starts empty with the switch off', () => {
    expect(initialValues('s3', null, '/opt/b')).toEqual({
      access_key_id: '', secret_access_key: '', region: '', endpoint: '', use_path_style_endpoint: false, location: '',
    })
  })

  it('sftp and ftp(s) get their default port', () => {
    expect(initialValues('sftp', null, '/opt/b').port).toBe(22)
    expect(initialValues('ftp', null, '/opt/b').port).toBe(21)
    expect(initialValues('ftps', null, '/opt/b').port).toBe(21)
    expect(initialValues('sftp', null, '/opt/b')).toMatchObject({ host: '', username: '', password: '', private_key: '', passphrase: '', location: '' })
  })

  it('keeps the location of the current store for its own driver only', () => {
    expect(initialValues('local', store('local', '/data'), '/opt/b').location).toBe('/data')
    expect(initialValues('s3', store('local', '/data'), '/opt/b').location).toBe('')
    expect(initialValues('s3', store('s3', 'bucket'), '/opt/b')).toMatchObject({ location: 'bucket', secret_access_key: '' })
  })
})

describe('storePayload', () => {
  it('local sends the trimmed location and no credentials', () => {
    expect(storePayload('local', { location: ' /data ' })).toEqual({ driver: 'local', location: '/data' })
  })

  it('s3 sends a bool switch, trims strings and leaves out the empty optional endpoint', () => {
    expect(storePayload('s3', {
      access_key_id: ' key ', secret_access_key: 'sec', region: 'eu', endpoint: '', use_path_style_endpoint: true, location: ' b ',
    })).toEqual({
      driver: 's3',
      location: 'b',
      credentials: { access_key_id: 'key', secret_access_key: 'sec', region: 'eu', use_path_style_endpoint: true },
    })
    expect(storePayload('s3', { use_path_style_endpoint: false }).credentials).toMatchObject({ use_path_style_endpoint: false })
  })

  it('sftp sends the port as a number, the key untrimmed and omits an empty key and password', () => {
    const withKey = storePayload('sftp', { host: 'h', port: '2222', username: 'u', password: '', private_key: '\n-----KEY-----\n', passphrase: '', location: '/r' })
    expect(withKey.credentials).toEqual({ host: 'h', port: 2222, username: 'u', private_key: '\n-----KEY-----\n' })

    const blankKey = storePayload('sftp', { host: 'h', port: 22, username: 'u', password: 'p', private_key: '  \n', location: '/r' })
    expect(blankKey.credentials).toEqual({ host: 'h', port: 22, username: 'u', password: 'p' })
  })
})
