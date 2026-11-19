import { describe, expect, it } from 'vitest'
import { renderMcpCode } from './mcp-code'

describe('renderMcpCode', () => {
  it('escapes & < > only', () => {
    expect(renderMcpCode('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; "d"')
  })

  it('wraps every YOUR_TOKEN in the placeholder span', () => {
    expect(renderMcpCode('Bearer YOUR_TOKEN and YOUR_TOKEN')).toBe(
      'Bearer <span class="tok-ph">YOUR_TOKEN</span> and <span class="tok-ph">YOUR_TOKEN</span>',
    )
  })

  it('escapes before wrapping, so the span itself is not escaped', () => {
    expect(renderMcpCode('<YOUR_TOKEN>')).toBe('&lt;<span class="tok-ph">YOUR_TOKEN</span>&gt;')
  })
})
