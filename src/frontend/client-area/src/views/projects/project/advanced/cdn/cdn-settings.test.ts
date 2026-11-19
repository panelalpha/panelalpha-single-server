import { describe, expect, it } from 'vitest'
import { cdnFeatureLabel, isCdnEnabled } from './cdn-settings'

describe('isCdnEnabled', () => {
  it('is false when the instance has no plan_settings', () => {
    expect(isCdnEnabled({})).toBe(false)
    expect(isCdnEnabled({ plan_settings: null })).toBe(false)
  })

  it('is false when the plan has no cdn entry', () => {
    expect(isCdnEnabled({ plan_settings: {} })).toBe(false)
  })

  it('is false for a null cdn entry', () => {
    expect(isCdnEnabled({ plan_settings: { cdn: null } })).toBe(false)
  })

  it('is false when the provider slug is "none"', () => {
    expect(isCdnEnabled({ plan_settings: { cdn: { provider_slug: 'none' } } })).toBe(false)
  })

  it('is true for an empty provider slug, as legacy does (planHasCdn treats it as off)', () => {
    expect(isCdnEnabled({ plan_settings: { cdn: { provider_slug: '' } } })).toBe(true)
  })

  it('is true for a real provider slug', () => {
    expect(isCdnEnabled({ plan_settings: { cdn: { provider_slug: 'bunny' } } })).toBe(true)
  })
})

describe('cdnFeatureLabel', () => {
  it('uses the translated title when there is one', () => {
    expect(cdnFeatureLabel({ name: 'waf', title: 'Web Application Firewall' })).toBe('Web Application Firewall')
  })

  it('falls back to the name when the title is empty', () => {
    expect(cdnFeatureLabel({ name: 'waf', title: '' })).toBe('waf')
  })

  it('falls back to the name when the title is null', () => {
    expect(cdnFeatureLabel({ name: 'edge_caching', title: null })).toBe('edge_caching')
  })
})
