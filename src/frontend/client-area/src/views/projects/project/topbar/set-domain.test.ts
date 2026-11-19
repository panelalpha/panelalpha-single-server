import { describe, expect, it } from 'vitest'
import { beginVerificationAttempt, canSubmitForm, domainComputed, finishVerificationAttempt, needsDnsGate, nextStepAfterForm, resetVerificationFlags, resolveCdnRecords, verificationMessage } from './set-domain'

describe('domainComputed', () => {
  it('uses the typed domain on panel 0 and the subdomain name on panel 1', () => {
    expect(domainComputed(0, 'shop.example', 'blog', 'panelalpha.online')).toBe('shop.example')
    expect(domainComputed(1, 'shop.example', 'blog', 'panelalpha.online')).toBe('blog.panelalpha.online')
  })

  it('falls back to the subdomain name when both panels are collapsed (legacy: undefined is not 0)', () => {
    expect(domainComputed(undefined, 'shop.example', 'blog', 'panelalpha.online')).toBe('blog.panelalpha.online')
  })
})

describe('canSubmitForm (fix 4)', () => {
  it('submits only from panel 0 or 1', () => {
    expect(canSubmitForm(0)).toBe(true)
    expect(canSubmitForm(1)).toBe(true)
  })

  it('does not submit when both panels are collapsed (panelOpen === undefined)', () => {
    expect(canSubmitForm(undefined)).toBe(false)
  })

  it('rejects any other panel index', () => {
    expect(canSubmitForm(2)).toBe(false)
    expect(canSubmitForm(-1)).toBe(false)
  })
})

describe('nextStepAfterForm', () => {
  it('goes to the transfer step only when transfer is allowed and verification is required', () => {
    expect(nextStepAfterForm({ transferAllowed: true, verificationRequired: true })).toBe(2)
  })

  it('goes to the DNS gate otherwise', () => {
    expect(nextStepAfterForm({ transferAllowed: true, verificationRequired: false })).toBe('verify-dns')
    expect(nextStepAfterForm({ transferAllowed: false, verificationRequired: true })).toBe('verify-dns')
    expect(nextStepAfterForm({ transferAllowed: false, verificationRequired: false })).toBe('verify-dns')
  })
})

describe('needsDnsGate', () => {
  it('runs from step 0 or 2 on panel 0 with eager verification', () => {
    expect(needsDnsGate({ step: 0, panel: 0, eager: true })).toBe(true)
    expect(needsDnsGate({ step: 2, panel: 0, eager: true })).toBe(true)
  })

  it('stays off without eager verification, on panel 1, on other steps, and for an unset flag', () => {
    expect(needsDnsGate({ step: 0, panel: 0, eager: false })).toBe(false)
    expect(needsDnsGate({ step: 0, panel: 0, eager: undefined })).toBe(false)
    expect(needsDnsGate({ step: 0, panel: 1, eager: true })).toBe(false)
    expect(needsDnsGate({ step: 0, panel: undefined, eager: true })).toBe(false)
    expect(needsDnsGate({ step: 1, panel: 0, eager: true })).toBe(false)
  })
})

describe('resolveCdnRecords', () => {
  it('uses non-empty options records and asks the caller to write them to the instance', () => {
    const records = [{ name: 'a' }]
    expect(resolveCdnRecords({ optionsRecords: records, planHasCdn: true, instanceRecords: [{ name: 'old' }] }))
      .toEqual({ records, clearCache: false })
  })

  it('keeps the instance records and clears the options cache when options are empty on a CDN plan', () => {
    const instanceRecords = [{ name: 'fastly' }]
    expect(resolveCdnRecords({ optionsRecords: [], planHasCdn: true, instanceRecords }))
      .toEqual({ records: instanceRecords, clearCache: true })
    expect(resolveCdnRecords({ optionsRecords: [], planHasCdn: true, instanceRecords: [] }))
      .toEqual({ records: [], clearCache: true })
  })

  it('writes empty options as the records when the plan has no CDN', () => {
    expect(resolveCdnRecords({ optionsRecords: [], planHasCdn: false, instanceRecords: [{ name: 'x' }] }))
      .toEqual({ records: [], clearCache: false })
  })

  it('treats missing options as empty', () => {
    expect(resolveCdnRecords({ optionsRecords: undefined, planHasCdn: false, instanceRecords: undefined }))
      .toEqual({ records: [], clearCache: false })
  })
})

describe('verification flags (fix 1 and fix 3)', () => {
  it('starts every opening with all flags cleared', () => {
    expect(resetVerificationFlags()).toEqual({ isNameserversCorrected: false, isRetried: false, isVerificationSuccessful: false })
  })

  it('clears isNameserversCorrected before a first attempt and keeps the other flags', () => {
    const flags = { isNameserversCorrected: true, isRetried: true, isVerificationSuccessful: false }
    expect(beginVerificationAttempt(flags, true)).toEqual({ isNameserversCorrected: false, isRetried: true, isVerificationSuccessful: false })
    expect(beginVerificationAttempt(flags, false)).toBe(flags)
  })

  it('a first attempt that resolves passes the gate without the green step', () => {
    const next = finishVerificationAttempt(resetVerificationFlags(), { resolved: true, firstAttempt: true })
    expect(next.isNameserversCorrected).toBe(true)
    expect(next.isVerificationSuccessful).toBe(false)
  })

  it('a first attempt that fails leaves the gate closed and does not mark a retry', () => {
    const next = finishVerificationAttempt(resetVerificationFlags(), { resolved: false, firstAttempt: true })
    expect(next).toEqual({ isNameserversCorrected: false, isRetried: false, isVerificationSuccessful: false })
  })

  it('green path: a successful re-check sets isVerificationSuccessful and the success message shows', () => {
    const afterFirst = finishVerificationAttempt(resetVerificationFlags(), { resolved: false, firstAttempt: true })
    const afterRetry = finishVerificationAttempt(afterFirst, { resolved: true, firstAttempt: false })
    expect(afterRetry.isVerificationSuccessful).toBe(true)
    expect(afterRetry.isNameserversCorrected).toBe(true)
    expect(verificationMessage(afterRetry)).toBe('success')
  })

  it('a failed re-check marks isRetried and switches the message to "try again"', () => {
    const afterRetry = finishVerificationAttempt(resetVerificationFlags(), { resolved: false, firstAttempt: false })
    expect(afterRetry.isRetried).toBe(true)
    expect(verificationMessage(afterRetry)).toBe('tryAgain')
  })

  it('shows "incorrect" before any re-check and not "try again" after a reset (fix 3)', () => {
    expect(verificationMessage(resetVerificationFlags())).toBe('incorrect')
    const retried = finishVerificationAttempt(resetVerificationFlags(), { resolved: false, firstAttempt: false })
    expect(verificationMessage(resetVerificationFlags())).toBe('incorrect')
    expect(verificationMessage(retried)).toBe('tryAgain')
  })
})
