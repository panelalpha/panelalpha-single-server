// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'DomainNameInput.vue'), 'utf8')

describe('DomainNameInput: the message under the field', () => {
  // V2 hid `.v-text-field__details` of an invalid field; the wrapper's own frame is not a substitute for the text, and the
  // Add Domain dialog showed nothing but a red border.
  it('does not hide the details of an invalid field', () => {
    expect(source).not.toMatch(/&\.v-input--error[^{]*\{[^}]*v-input__details/)
    expect(source).not.toMatch(/\.v-input__details\s*\{\s*display:\s*none/)
  })

  it('gives the message its own row under the control', () => {
    expect(source).toMatch(/&__text-input \{[^}]*flex-direction: column;/)
  })
})
