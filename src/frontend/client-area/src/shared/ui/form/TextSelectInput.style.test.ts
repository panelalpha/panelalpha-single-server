// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'TextSelectInput.vue'), 'utf8')

describe('TextSelectInput: układ pola prefiksu i selecta (#33)', () => {
  it('pole prefiksu ma minimalną szerokość 110 px, a select min-width 0 na każdej szerokości', () => {
    expect(source).toMatch(/&__text-input \{\s*min-width: 110px;\s*\}\s*&__select-input \{\s*min-width: 0;\s*\}/)
    expect(source).not.toMatch(/@media \(min-width: 576px\)/)
  })

  it('na telefonie (< 576 px) pole prefiksu i select są w dwóch rzędach, w jednej ramce', () => {
    const phone = source.slice(source.indexOf('@media (max-width: 575.98px)'))
    expect(phone).toMatch(/display: grid;/)
    expect(phone).toMatch(/&__text-input \{\s*grid-column: 1;\s*grid-row: 1;/)
    expect(phone).toMatch(/&__text-input\.v-input\.v-text-field,\s*&__select-input\.v-input\.v-text-field \{\s*margin-bottom: 0;/)
    expect(phone).toMatch(/\.v-form & \{\s*margin-bottom: 24px;/)
    expect(phone).toMatch(/&__select-input \{\s*grid-column: 1 \/ -1;\s*grid-row: 2;/)
    expect(phone).toMatch(/&::before,\s*&::after \{\s*height: 100%;/)
  })

  it('blok telefonu stoi po regule &__suffix, żeby wygrać z jej marginesem', () => {
    expect(source.indexOf('@media (max-width: 575.98px)')).toBeGreaterThan(source.indexOf('&__suffix {'))
  })

  it('układ z błędem ma własne min-width pola tekstowego (65 px) i wygrywa z regułą bazową', () => {
    expect(source).toMatch(/&--error &__text-input \{\s*min-width: 65px;/)
    expect(source.indexOf('&__text-input {')).toBeLessThan(source.indexOf('&--error &__text-input'))
  })
})
