import { describe, expect, it } from 'vitest'
import { FREE_HUB_RETURN_KEY } from './hub-return'

describe('FREE_HUB_RETURN_KEY', () => {
  it('uses a stable storage key', () => {
    expect(FREE_HUB_RETURN_KEY).toBe('free-hub-return')
  })
})
