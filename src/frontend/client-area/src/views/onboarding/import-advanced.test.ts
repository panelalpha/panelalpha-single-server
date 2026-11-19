import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type AdvancedFormValues,
  buildFtpTestBody,
  DEFAULT_FTP_PORT,
  DEFAULT_FTP_PROTOCOL,
  demoConnectionTest,
  hasEmptyRequiredFields,
} from './import-advanced'

const form: AdvancedFormValues = {
  importUrl: ' https://example.com/ ',
  hostname: 'ftp.example.com',
  protocol: 'FTP',
  port: 21,
  username: 'ftp-user',
  password: 'ftp-secret',
  installedPath: 'wp',
  authMethod: 'password',
  sftpUsername: 'sftp-user',
  sftpPassword: 'sftp-secret',
  sftpPrivateKey: '-----BEGIN KEY-----',
  sftpPassphrase: 'passphrase',
}

describe('defaults', () => {
  it('starts on FTP and port 21, as legacy', () => {
    expect(DEFAULT_FTP_PROTOCOL).toBe('FTP')
    expect(DEFAULT_FTP_PORT).toBe(21)
  })
})

describe('hasEmptyRequiredFields', () => {
  it('is false when every shared field has a value', () => {
    expect(hasEmptyRequiredFields(form)).toBe(false)
  })

  it.each([
    ['hostname', { hostname: '' }],
    ['protocol', { protocol: '' }],
    ['port', { port: '' }],
    ['username', { username: '' }],
    ['password', { password: '' }],
    ['installedPath', { installedPath: '' }],
  ])('is true when %s is empty', (_name, patch) => {
    expect(hasEmptyRequiredFields({ ...form, ...patch })).toBe(true)
  })

  it('ignores the SFTP fields, as legacy does', () => {
    expect(hasEmptyRequiredFields({ ...form, sftpUsername: '', sftpPassword: '' })).toBe(false)
  })
})

describe('buildFtpTestBody', () => {
  it('sends the FTP fields for FTP, lowercased protocol, untrimmed url and path, no ip_address', () => {
    expect(buildFtpTestBody(form, 7)).toStrictEqual({
      type: 'ftp',
      service_id: 7,
      url: ' https://example.com/ ',
      protocol: 'ftp',
      path: 'wp',
      ftp_host: 'ftp.example.com',
      ftp_port: 21,
      ftp_username: 'ftp-user',
      ftp_password: 'ftp-secret',
    })
  })

  it('sends the FTPS fields for FTPS', () => {
    expect(buildFtpTestBody({ ...form, protocol: 'FTPS', port: '990' }, '7')).toStrictEqual({
      type: 'ftp',
      service_id: '7',
      url: ' https://example.com/ ',
      protocol: 'ftps',
      path: 'wp',
      ftps_host: 'ftp.example.com',
      ftps_port: '990',
      ftps_username: 'ftp-user',
      ftps_password: 'ftp-secret',
    })
  })

  it('sends the SFTP password when the auth method is password', () => {
    const body = buildFtpTestBody({ ...form, protocol: 'SFTP', port: 22, authMethod: 'password' }, 7)
    expect(body).toStrictEqual({
      type: 'ftp',
      service_id: 7,
      url: ' https://example.com/ ',
      protocol: 'sftp',
      path: 'wp',
      sftp_host: 'ftp.example.com',
      sftp_port: 22,
      sftp_auth_method: 'password',
      sftp_username: 'sftp-user',
      sftp_password: 'sftp-secret',
    })
    expect(body).not.toHaveProperty('sftp_private_key')
    expect(body).not.toHaveProperty('ftp_host')
  })

  it('sends the private key and the passphrase when the auth method is ssh_key', () => {
    expect(buildFtpTestBody({ ...form, protocol: 'SFTP', port: 22, authMethod: 'ssh_key' }, 7)).toStrictEqual({
      type: 'ftp',
      service_id: 7,
      url: ' https://example.com/ ',
      protocol: 'sftp',
      path: 'wp',
      sftp_host: 'ftp.example.com',
      sftp_port: 22,
      sftp_auth_method: 'ssh_key',
      sftp_username: 'sftp-user',
      sftp_private_key: '-----BEGIN KEY-----',
      sftp_private_key_passphrase: 'passphrase',
    })
  })

  it('omits the passphrase when it is empty', () => {
    const body = buildFtpTestBody({ ...form, protocol: 'SFTP', authMethod: 'ssh_key', sftpPassphrase: '' }, 7)
    expect(body).not.toHaveProperty('sftp_private_key_passphrase')
    expect(body).not.toHaveProperty('sftp_password')
  })

  it('sends the shared fields only for an unknown protocol', () => {
    const body = buildFtpTestBody({ ...form, protocol: 'WEBDAV' }, 7)
    expect(body).toStrictEqual({
      type: 'ftp',
      service_id: 7,
      url: ' https://example.com/ ',
      protocol: 'webdav',
      path: 'wp',
    })
  })
})

describe('demoConnectionTest', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves a success after the delay', async () => {
    vi.useFakeTimers()
    const pending = demoConnectionTest('ftp.example.com', 2000)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toStrictEqual({ success: true })
  })

  it('rejects with false for the hostname reject', async () => {
    await expect(demoConnectionTest('reject')).rejects.toBe(false)
  })
})
