import { describe, expect, it } from 'vitest'
import { compareVersions, highestVersion, versionGreater } from './compare-versions'

describe('versionGreater', () => {
  it('is true when the available version is greater', () => {
    expect(versionGreater('6.5.2', '6.5.1')).toBe(true)
  })

  it('is false when the versions are equal or the installed one is newer', () => {
    expect(versionGreater('6.5.1', '6.5.1')).toBe(false)
    expect(versionGreater('6.5.0', '6.5.1')).toBe(false)
  })

  it('is false when there is no available version', () => {
    expect(versionGreater(null, '6.5.1')).toBe(false)
    expect(versionGreater(undefined, '6.5.1')).toBe(false)
  })

  it('treats an available version over an uninstalled product as an update, as legacy does', () => {
    expect(versionGreater('6.0', null)).toBe(true)
  })

  it('compares numeric segments as numbers (WooCommerce 11.3.0 over 9.0.0)', () => {
    expect(versionGreater('11.3.0', '9.0.0')).toBe(true)
    expect(versionGreater('9.0.0', '11.3.0')).toBe(false)
  })

  it('sees a two-digit segment as greater than a one-digit one', () => {
    expect(versionGreater('10.0.0', '9.9.0')).toBe(true)
    expect(versionGreater('10', '9')).toBe(true)
  })
})

describe('compareVersions', () => {
  it('returns 1, 0 or -1 by numeric segments', () => {
    expect(compareVersions('11.3.0', '9.0.0')).toBe(1)
    expect(compareVersions('9.0.0', '11.3.0')).toBe(-1)
    expect(compareVersions('6.5.1', '6.5.1')).toBe(0)
  })

  it('treats missing trailing segments as 0', () => {
    expect(compareVersions('6.5', '6.5.0')).toBe(0)
    expect(compareVersions('6.5.0.1', '6.5')).toBe(1)
  })

  it('sorts a version with a suffix below the same version without one', () => {
    expect(compareVersions('6.6', '6.6-RC1')).toBe(1)
    expect(compareVersions('9.0.0-rc.1', '9.0.0')).toBe(-1)
  })

  it('compares suffixes with numeric chunks', () => {
    expect(compareVersions('6.6-RC2', '6.6-RC1')).toBe(1)
    expect(compareVersions('6.6-RC10', '6.6-RC2')).toBe(1)
    expect(compareVersions('6.6-beta2', '6.6-RC1')).toBe(-1)
  })

  it('ranks a pre-release of a newer core above a release of an older core', () => {
    expect(compareVersions('6.6-RC1', '6.5.2')).toBe(1)
  })

  it('ignores a leading v and build metadata', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3+build.5', '1.2.3')).toBe(0)
  })

  it('reads an empty or missing version as lower than any version', () => {
    expect(compareVersions('', '')).toBe(0)
    expect(compareVersions('', '0')).toBe(-1)
    expect(compareVersions(null, '0.0.1')).toBe(-1)
    expect(compareVersions(undefined, null)).toBe(0)
  })

  it('does not throw on junk and reads a non-numeric segment as 0', () => {
    expect(compareVersions('abc', '6.0')).toBe(-1)
    expect(compareVersions('6.x', '6.0')).toBe(0)
  })

  it('is antisymmetric on a sample', () => {
    const sample = ['9.0.0', '10.0.0', '6.6-RC1', '6.6', '6.6-RC10', '', '6.x', 'v9.0.0']
    for (const a of sample) {
      for (const b of sample) {
        expect(compareVersions(a, b) + compareVersions(b, a)).toBe(0)
      }
    }
  })
})

describe('highestVersion', () => {
  it('returns undefined for an empty list', () => {
    expect(highestVersion([])).toBeUndefined()
  })

  it('picks the highest by numeric compare whatever the order', () => {
    expect(highestVersion(['9.9.0', '10.0.0'])).toBe('10.0.0')
    expect(highestVersion(['10.0.0', '9.9.0'])).toBe('10.0.0')
    expect(highestVersion(['9.0.0', '11.3.0'])).toBe('11.3.0')
    expect(highestVersion(['11.3.0', '9.0.0'])).toBe('11.3.0')
  })

  it('picks the highest of a list in API order', () => {
    expect(highestVersion(['6.5.0', '6.4.2'])).toBe('6.5.0')
  })

  it('prefers the release over its pre-release', () => {
    expect(highestVersion(['6.6-RC1', '6.5.2', '6.6'])).toBe('6.6')
  })

  it('keeps the first of two equal versions', () => {
    expect(highestVersion(['6.6', '6.6.0'])).toBe('6.6')
  })
})
