import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_SECURITY_LEVELS, isCloudflareLoading, isCloudflareOn } from './cloudflare-settings'

describe('isCloudflareOn', () => {
  it('is true only for the string "on"', () => {
    expect(isCloudflareOn('on')).toBe(true)
  })

  it('is false for any other value', () => {
    expect(isCloudflareOn('off')).toBe(false)
    expect(isCloudflareOn('')).toBe(false)
    expect(isCloudflareOn(undefined)).toBe(false)
    expect(isCloudflareOn(true)).toBe(false)
  })
})

describe('isCloudflareLoading', () => {
  it('is true only when all three fetches are still in flight', () => {
    expect(isCloudflareLoading(true, true, true)).toBe(true)
  })

  it('is false as soon as any one of the three fetches has finished', () => {
    expect(isCloudflareLoading(true, true, false)).toBe(false)
    expect(isCloudflareLoading(true, false, true)).toBe(false)
    expect(isCloudflareLoading(false, true, true)).toBe(false)
  })

  it('is false when none of the fetches is in flight', () => {
    expect(isCloudflareLoading(false, false, false)).toBe(false)
  })
})

describe('CLOUDFLARE_SECURITY_LEVELS', () => {
  it('lists the six legacy levels in legacy order with their translation keys', () => {
    expect(CLOUDFLARE_SECURITY_LEVELS).toEqual([
      { value: 'off', labelKey: 'form.option.cloudflareSecurity.off' },
      { value: 'essentially_off', labelKey: 'form.option.cloudflareSecurity.essentiallyOff' },
      { value: 'low', labelKey: 'form.option.cloudflareSecurity.low' },
      { value: 'medium', labelKey: 'form.option.cloudflareSecurity.medium' },
      { value: 'high', labelKey: 'form.option.cloudflareSecurity.high' },
      { value: 'under_attack', labelKey: 'form.option.cloudflareSecurity.underAttack' },
    ])
  })
})
