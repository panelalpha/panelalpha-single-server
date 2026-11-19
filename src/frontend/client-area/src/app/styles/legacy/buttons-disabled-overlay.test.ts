// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '_buttons.scss'), 'utf8')

describe('_buttons.scss: wyłączony przycisk bez warstwy stanu (#36)', () => {
  it('wyłączony outlined i .v-btn--default ma przezroczystą nakładkę, bo V2 nie malował stanu na wyłączonym', () => {
    expect(source).toMatch(
      /\.v-btn\.v-btn--disabled:is\(\.v-btn--variant-outlined, \.v-btn--default\) \{[^}]*?\.v-btn__overlay \{\s*opacity: 0 !important;/,
    )
  })

  it('wyłączony wypełniony przycisk (primary i error) zostaje z przezroczystą nakładką', () => {
    const filled = /\.v-btn__overlay \{\s*opacity: 0 !important;/g
    expect(source.match(filled)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})

describe('_buttons.scss: przycisk surface (#40)', () => {
  it('app-button--surface ma tło --v-btn-surface, bo V4 maluje domyślny przycisk na biało', () => {
    expect(source).toMatch(/\.v-btn\.app-button--surface \{\s*background-color: var\(--v-btn-surface\);/)
  })
})
