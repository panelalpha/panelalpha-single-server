import { describe, expect, it } from 'vitest'
import {
  buildPluginTestBody,
  handOnDetails,
  initialLoginUrl,
  normalizeLoginUrl,
  pluginDownloadUrl,
  type PluginFormValues,
} from './import-simple'

const form: PluginFormValues = {
  importUrl: ' https://example.com/ ',
  importIp: '',
  loginUrl: ' https://example.com/wp-login.php ',
  username: 'admin',
  password: 'secret',
}

describe('initialLoginUrl', () => {
  it('appends /wp-login.php to a site url with a root path', () => {
    expect(initialLoginUrl('https://example.com')).toBe('https://example.com/wp-login.php')
    expect(initialLoginUrl('https://example.com/')).toBe('https://example.com/wp-login.php')
  })

  it('keeps a url that already has a path', () => {
    expect(initialLoginUrl('https://example.com/blog')).toBe('https://example.com/blog')
    expect(initialLoginUrl('https://example.com/blog/')).toBe('https://example.com/blog/')
  })

  it('keeps a url the parser rejects, as legacy does for a url with no scheme', () => {
    expect(initialLoginUrl('example.com')).toBe('example.com')
  })

  it('returns an empty login url for no site url', () => {
    expect(initialLoginUrl('')).toBe('')
    expect(initialLoginUrl(null)).toBe('')
    expect(initialLoginUrl(undefined)).toBe('')
  })
})

describe('normalizeLoginUrl', () => {
  it('adds https:// to a url with no scheme', () => {
    expect(normalizeLoginUrl('example.com/wp-login.php')).toBe('https://example.com/wp-login.php')
  })

  it('keeps a url that has a scheme, in any case', () => {
    expect(normalizeLoginUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
  })

  it('turns an empty field into https://, as legacy does on blur', () => {
    expect(normalizeLoginUrl(' '.repeat(3))).toBe('https://')
  })
})

describe('buildPluginTestBody', () => {
  it('sends the plugin shape with the admin login credentials when the admin panel is open', () => {
    expect(buildPluginTestBody(form, 7, 0)).toEqual({
      type: 'plugin',
      service_id: 7,
      url: 'https://example.com/',
      login_url: 'https://example.com/wp-login.php',
      username: 'admin',
      password: 'secret',
      using_admin_login_credentials: true,
    })
  })

  it('sends using_admin_login_credentials false when the manual panel is open', () => {
    expect(buildPluginTestBody(form, 7, 1)).toMatchObject({ using_admin_login_credentials: false })
    expect(buildPluginTestBody(form, 7, null)).toMatchObject({ using_admin_login_credentials: false })
  })

  it('adds ip_address only when the import data holds one', () => {
    expect(buildPluginTestBody({ ...form, importIp: ' 203.0.113.10 ' }, 7, 0)).toMatchObject({ ip_address: '203.0.113.10' })
    expect(buildPluginTestBody({ ...form, importIp: ' '.repeat(3) }, 7, 0)).not.toHaveProperty('ip_address')
    expect(buildPluginTestBody({ ...form, importIp: null }, 7, 0)).not.toHaveProperty('ip_address')
  })

  it('trims the site url and the login url, and keeps the credentials as typed', () => {
    const body = buildPluginTestBody({ ...form, username: ' admin ' }, 7, 0)
    expect(body.url).toBe('https://example.com/')
    expect(body.login_url).toBe('https://example.com/wp-login.php')
    expect(body.username).toBe(' admin ')
  })
})

describe('pluginDownloadUrl', () => {
  it('points at the plugin download path of the API', () => {
    expect(pluginDownloadUrl().endsWith('/instances/import/download-plugin')).toBe(true)
  })
})

describe('handOnDetails', () => {
  it('hands the answer on with the typed password, which the panel never echoes back', () => {
    expect(handOnDetails({
      success: true,
      import_details: { url: 'https://www.example.com', login_url: 'https://www.example.com/wp-login.php', username: 'admin', using_admin_login_credentials: true },
    }, 'secret')).toEqual({
      url: 'https://www.example.com',
      login_url: 'https://www.example.com/wp-login.php',
      username: 'admin',
      using_admin_login_credentials: true,
      password: 'secret',
    })
  })

  it('adds no password for the manual plugin method', () => {
    expect(handOnDetails({ success: true, import_details: { url: 'https://www.example.com', using_admin_login_credentials: false } }, 'typed-in-the-other-panel'))
      .toEqual({ url: 'https://www.example.com', using_admin_login_credentials: false })
  })
})
