import { describe, expect, it } from 'vitest'
import { infoCardColumns } from './info-card'

describe('info-card', () => {
  it('maps the span to the column breakpoints of the General grid', () => {
    expect(infoCardColumns('quarter')).toEqual({ cols: '12', sm: '6', md: '6', xl: '3' })
    expect(infoCardColumns('half')).toEqual({ cols: '12', xl: '6' })
    expect(infoCardColumns('full')).toEqual({ cols: '12' })
  })
})
