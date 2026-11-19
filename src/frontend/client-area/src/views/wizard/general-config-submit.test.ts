import { describe, expect, it, vi } from 'vitest'
import { type GeneralConfigDeps, type GeneralConfigValues, submitGeneralConfig, submitServerName, toSetupPayload } from './general-config-submit'

const values: GeneralConfigValues = {
  serverName: 'My server',
  name: 'Ada',
  email: 'ada@example.com',
  password: 'Secret1!',
  passwordConfirm: 'Secret1!',
}

function deps (overrides: Partial<GeneralConfigDeps> = {}): GeneralConfigDeps {
  return {
    fetchCsrfCookie: vi.fn().mockResolvedValue(undefined),
    createFreeSetup: vi.fn().mockResolvedValue(undefined),
    afterCreated: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('toSetupPayload', () => {
  it('maps the form to the fields of POST /community/setup', () => {
    expect(toSetupPayload(values)).toEqual({
      serverName: 'My server',
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Secret1!',
      passwordConfirmation: 'Secret1!',
    })
  })

  it('trims the server name, like the name the Hub mode saves', () => {
    expect(toSetupPayload({ ...values, serverName: '  Acme server  ' }).serverName).toBe('Acme server')
  })
})

describe('submitGeneralConfig', () => {
  it('gets the CSRF cookie, creates the account and reads the session, in this order', async () => {
    const calls: string[] = []
    const d = deps({
      fetchCsrfCookie: vi.fn(async () => {
        calls.push('csrf')
      }),
      createFreeSetup: vi.fn(async () => {
        calls.push('setup')
      }),
      afterCreated: vi.fn(async () => {
        calls.push('after')
      }),
    })
    await expect(submitGeneralConfig(values, d)).resolves.toEqual({ kind: 'created' })
    expect(calls).toEqual(['csrf', 'setup', 'after'])
    expect(d.createFreeSetup).toHaveBeenCalledWith(toSetupPayload(values))
  })

  it('treats 409 as a conflict and does not read the session', async () => {
    const d = deps({ createFreeSetup: vi.fn().mockRejectedValue({ response: { status: 409, data: {} } }) })
    await expect(submitGeneralConfig(values, d)).resolves.toEqual({ kind: 'conflict' })
    expect(d.afterCreated).not.toHaveBeenCalled()
  })

  it('returns the messages of a 422 without the field-name prefix (ID-48)', async () => {
    const d = deps({
      createFreeSetup: vi.fn().mockRejectedValue({ response: { status: 422, data: { errors: { email: ['The email has already been taken.'] } } } }),
    })
    await expect(submitGeneralConfig(values, d)).resolves.toEqual({ kind: 'failed', messages: ['The email has already been taken.'] })
  })

  it('returns a message when the request does not reach the server', async () => {
    const d = deps({ createFreeSetup: vi.fn().mockRejectedValue(new Error('Network Error')) })
    const outcome = await submitGeneralConfig(values, d)
    expect(outcome.kind).toBe('failed')
  })
})

describe('submitServerName', () => {
  const current = { name: 'My server', default_language: 'en', default_date_format: 'DD/MM/YYYY' }

  it('saves the trimmed name with the current defaults', async () => {
    const saveWizardServerName = vi.fn().mockResolvedValue(undefined)
    await expect(submitServerName('  Acme  ', current, { saveWizardServerName })).resolves.toEqual({ kind: 'saved' })
    expect(saveWizardServerName).toHaveBeenCalledWith('Acme', current)
  })

  it('returns the messages of the name field of a 422', async () => {
    const saveWizardServerName = vi.fn().mockRejectedValue({ response: { status: 422, data: { errors: { name: ['The name is too long.'] } } } })
    await expect(submitServerName('Acme', current, { saveWizardServerName })).resolves.toEqual({
      kind: 'failed',
      messages: ['The name is too long.'],
      fieldMessages: ['The name is too long.'],
    })
  })

  it('has no field messages for another error', async () => {
    const saveWizardServerName = vi.fn().mockRejectedValue({ response: { status: 500, data: { message: 'Server exploded' } } })
    await expect(submitServerName('Acme', current, { saveWizardServerName })).resolves.toEqual({
      kind: 'failed',
      messages: ['Server exploded'],
      fieldMessages: [],
    })
  })
})
