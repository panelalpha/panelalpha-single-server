import { describe, expect, it } from 'vitest'
import { previewSiteHref, validPreviewSite } from './preview-site'

const NOW = 1_800_000_000
const FUTURE = String(NOW + 3600)
const PAST = String(NOW - 1)

describe('validPreviewSite', () => {
  it('returns the stored site while valid_until is in the future', () => {
    expect(validPreviewSite({ url: 'tmp.example.test', valid_until: FUTURE }, NOW))
      .toEqual({ url: 'tmp.example.test', valid_until: FUTURE })
  })

  it('returns null for undefined and null, so the modal shows its initial state without throwing', () => {
    expect(validPreviewSite(undefined, NOW)).toBeNull()
    expect(validPreviewSite(null, NOW)).toBeNull()
  })

  it('returns null for a primitive or a non-object value', () => {
    expect(validPreviewSite('tmp.example.test', NOW)).toBeNull()
    expect(validPreviewSite(42, NOW)).toBeNull()
  })

  it('returns null when valid_until is in the past', () => {
    expect(validPreviewSite({ url: 'tmp.example.test', valid_until: PAST }, NOW)).toBeNull()
  })

  it('treats valid_until equal to now as expired, as legacy does', () => {
    expect(validPreviewSite({ url: 'tmp.example.test', valid_until: String(NOW) }, NOW)).toBeNull()
  })

  it('returns null when valid_until is absent, empty or not a number', () => {
    expect(validPreviewSite({ url: 'tmp.example.test' }, NOW)).toBeNull()
    expect(validPreviewSite({ url: 'tmp.example.test', valid_until: '' }, NOW)).toBeNull()
    expect(validPreviewSite({ url: 'tmp.example.test', valid_until: 'soon' }, NOW)).toBeNull()
  })

  it('returns null when the url is missing', () => {
    expect(validPreviewSite({ valid_until: FUTURE }, NOW)).toBeNull()
    expect(validPreviewSite({ url: '', valid_until: FUTURE }, NOW)).toBeNull()
  })
})

describe('previewSiteHref', () => {
  it('keeps an https url as it is', () => {
    expect(previewSiteHref('https://tmp.example.test')).toBe('https://tmp.example.test')
  })

  it('adds https to a bare host, as legacy temporaryUrlComputed does', () => {
    expect(previewSiteHref('tmp.example.test')).toBe('https://tmp.example.test')
  })
})
