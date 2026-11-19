// The backup codes are shown as they are: the server compares a recovery code case-sensitively, so a box
// that re-cases the codes in CSS shows a string that the challenge endpoint refuses. jsdom applies no stylesheet, so
// this guard reads the component's own style block.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'RecoveryCodeBox.vue'), 'utf8')
const style = /<style[\s\S]*?<\/style>/.exec(source)?.[0] ?? ''

describe('RecoveryCodeBox: the codes on the screen are the codes that work', () => {
  it('has a style block to check', () => {
    expect(style).toContain('.recovery-code-box')
  })

  it('never re-cases the code text', () => {
    expect(style).not.toMatch(/text-transform\s*:\s*(uppercase|lowercase|capitalize)/)
  })

  it('sets the code value in a monospace face, where l/I/1 and O/0 can be told apart', () => {
    expect(style).toMatch(/\.recovery-code-value\s*\{[^}]*font-family:[^;}]*monospace/)
  })
})
