// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '_inputs.scss'), 'utf8')

describe('_inputs.scss: etykieta pola w błędzie (#44)', () => {
  it('etykieta pola wypełnionego (bez solo) w błędzie ma kolor error, jak V2', () => {
    expect(source).toMatch(
      /\.v-theme--light \.v-input--error:not\(\.v-input--disabled\) \.v-field:not\(\.v-field--single-line\) \.v-label\.v-field-label \{\s*color: rgb\(var\(--v-theme-error\)\);/,
    )
  })

  it('szara etykieta dla pola solo (single-line) zostaje bez reguły błędu', () => {
    expect(source).toMatch(/\.v-theme--light \.v-input \.v-field \.v-label\.v-field-label \{\s*color: rgba\(0, 0, 0, 0\.6\);\s*opacity: 1;/)
  })
})

describe('_inputs.scss: etykieta pola w fokusie', () => {
  it('etykieta pola z fokusem (bez solo, bez błędu) ma kolor primary, jak V2', () => {
    expect(source).toMatch(
      /\.v-field\.v-field--focused:not\(\.v-field--error\):not\(\.v-field--single-line\) \.v-label\.v-field-label \{\s*color: rgb\(var\(--v-theme-primary\)\);/,
    )
  })
})

describe('_inputs.scss: przyrostek pola', () => {
  it('przyrostek pola jest widoczny od razu, w kolorze pola, z odstępem 4 px, jak V2', () => {
    expect(source).toMatch(
      /\.v-text-field\.v-input \.v-field \.v-text-field__suffix \{\s*padding-inline: 4px 0;\s*color: inherit;\s*opacity: 1;/,
    )
  })
})
