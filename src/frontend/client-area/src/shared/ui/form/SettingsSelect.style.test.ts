// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'SettingsSelect.vue'), 'utf8')

describe('SettingsSelect: miejsce na wartość (#16)', () => {
  it('ikona strzałki bez marginesu V4 (append-inner 34 px jak V2)', () => {
    expect(source).toMatch(/\.v-select :deep\(\.v-select__menu-icon\) \{\s*margin-inline-start: 0;/)
  })

  it('tekst wartości ma overflow visible jak legacy (bez wielokropka)', () => {
    expect(source).toMatch(/\.v-select :deep\(\.v-select__selection-text\) \{\s*overflow: visible;/)
  })
})
