import { describe, expect, it } from 'vitest'
import { parityOutputDir } from './output-dir'

describe('parityOutputDir', () => {
  it('defaults to parity/output/parity-harness', () => {
    expect(parityOutputDir({}, '/repo')).toBe('/repo/parity/output/parity-harness')
  })

  it('uses PARITY_CHANGE as the directory name', () => {
    expect(parityOutputDir({ PARITY_CHANGE: 'ui-login' }, '/repo')).toBe('/repo/parity/output/ui-login')
  })

  it('PARITY_OUT_DIR overrides the whole path', () => {
    expect(parityOutputDir({ PARITY_OUT_DIR: 'context/changes/ui-login/parity', PARITY_CHANGE: 'x' }, '/repo')).toBe('/repo/context/changes/ui-login/parity')
  })
})
