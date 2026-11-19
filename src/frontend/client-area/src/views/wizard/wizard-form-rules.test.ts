import { describe, expect, it } from 'vitest'
import { confirmRules, serverNameRules } from './wizard-form-rules'

const t = (key: string, options?: Record<string, unknown>) => options?.field ? `${key}:${String(options.field)}` : key

describe('serverNameRules', () => {
  const [rule] = serverNameRules(t)

  it('rejects empty, blank and non-string values with the required message', () => {
    expect(rule('')).toBe('setup.validation.required:setup.serverName')
    expect(rule(' '.repeat(3))).toBe('setup.validation.required:setup.serverName')
    expect(rule(undefined)).toBe('setup.validation.required:setup.serverName')
    expect(rule(null)).toBe('setup.validation.required:setup.serverName')
  })

  it('accepts a name with content', () => {
    expect(rule('My server')).toBe(true)
  })
})

describe('confirmRules', () => {
  it('accepts the password and rejects any other value with the mismatch message', () => {
    let password = 'Secret1!'
    const [rule] = confirmRules(t, () => password)

    expect(rule('Secret1!')).toBe(true)
    expect(rule('secret1!')).toBe('setup.validation.passwordMismatch')
    expect(rule('')).toBe('setup.validation.passwordMismatch')
    password = ''
    expect(rule('')).toBe(true)
  })
})
