import { describe, expect, it } from 'vitest'
import { EMPTY_STATE_VARIANTS, emptyStateTitleTag } from './empty-state'

describe('emptyStateTitleTag', () => {
  it('gives each variant the heading level of its legacy copy', () => {
    expect(EMPTY_STATE_VARIANTS.map(variant => emptyStateTitleTag(variant))).toEqual(['h3', 'p', 'p', 'h4', 'h1', 'h6', 'h6'])
  })
})
