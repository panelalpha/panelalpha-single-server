import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { failureMessage, ftpOutcome, pluginOutcome } from './import-connection'

describe('pluginOutcome', () => {
  it('maps error_type error to an error', () => {
    expect(pluginOutcome({ error_type: 'error', message: 'Wrong login' })).toBe('error')
  })

  it('maps error_type connection_error to the manual-install switch', () => {
    expect(pluginOutcome({ error_type: 'connection_error', message: 'Host unreachable' })).toBe('connection_error')
  })

  it('maps error_type warning to a warning', () => {
    expect(pluginOutcome({ error_type: 'warning', message: 'Plugin outdated' })).toBe('warning')
  })

  it('maps success true to a success', () => {
    expect(pluginOutcome({ success: true, import_details: { method: 'plugin' } })).toBe('success')
  })

  it('checks error_type before success, as legacy does', () => {
    expect(pluginOutcome({ error_type: 'error', success: true })).toBe('error')
  })

  it('falls through to unknown for a result with no known outcome', () => {
    expect(pluginOutcome({ error_type: 'success', success: false })).toBe('unknown')
    expect(pluginOutcome({})).toBe('unknown')
  })
})

describe('failureMessage', () => {
  it('shows the answer\'s own sentence', () => {
    expect(failureMessage({ message: 'This site\'s domain is already used by a project on this server.' }, 'fallback'))
      .toBe('This site\'s domain is already used by a project on this server.')
  })

  it('shows the fallback sentence when the answer carries no message', () => {
    expect(failureMessage({}, 'fallback')).toBe('fallback')
    expect(failureMessage({ message: '' }, 'fallback')).toBe('fallback')
    expect(failureMessage({ message: ' '.repeat(3) }, 'fallback')).toBe('fallback')
  })
})

describe('failureMessage under app-lite single server', () => {
  function home (active: boolean) {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome({ app: { single_server: { active } }, user: {} } as never)
  }

  it('rebrands the answer\'s sentence like the panel\'s HTTP errors (LITE/apis/Api.js:94-96)', () => {
    home(true)
    expect(failureMessage({ message: 'Cannot generate subdomain for imported instance' }, 'fallback'))
      .toBe('Cannot generate subdomain for imported project')
    expect(failureMessage({ message: 'Cannot retry installation on this instance.' }, 'fallback'))
      .toBe('Cannot retry installation on this project.')
  })

  it('leaves a URL the answer quotes as the source spelled it', () => {
    home(true)
    expect(failureMessage({ message: 'No WordPress login page at https://instance.panelalpha.online/wp-login.php' }, 'fallback'))
      .toBe('No WordPress login page at https://instance.panelalpha.online/wp-login.php')
    expect(failureMessage({ message: 'The instance at https://instance.example.com/instances/1 answered 404' }, 'fallback'))
      .toBe('The project at https://instance.example.com/instances/1 answered 404')
  })

  it('leaves the sentence as it is on multi server', () => {
    home(false)
    expect(failureMessage({ message: 'Cannot generate subdomain for imported instance' }, 'fallback'))
      .toBe('Cannot generate subdomain for imported instance')
  })
})

describe('ftpOutcome', () => {
  it('maps severity error to an error', () => {
    expect(ftpOutcome({ severity: 'error', message: 'Access denied' })).toBe('error')
  })

  it('maps severity warning to a warning', () => {
    expect(ftpOutcome({ severity: 'warning', message: 'Path not found' })).toBe('warning')
  })

  it('maps success true to a success', () => {
    expect(ftpOutcome({ success: true, import_details: { method: 'ftp' } })).toBe('success')
  })

  it('checks severity before success, as legacy does', () => {
    expect(ftpOutcome({ severity: 'warning', success: true })).toBe('warning')
  })

  it('ignores the plugin field error_type', () => {
    expect(ftpOutcome({ error_type: 'error' })).toBe('unknown')
  })

  it('falls through to unknown for a result with no known outcome', () => {
    expect(ftpOutcome({})).toBe('unknown')
  })
})
