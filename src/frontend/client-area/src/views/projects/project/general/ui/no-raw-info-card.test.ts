// Contract test: a General card is `InfoCard`. Seven cards repeated the column, the card, the title and the
// action button rules; a new card written by hand would bring the copies back. The Git and Files cards render the Source shell
// (`SourceInfoCardShell`), which renders the pattern. `SecurityInfoCard.vue` is a setting card.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..', '..', '..')
const ROOT = join(SRC, '..')
const CARDS_DIR = join(SRC, 'views', 'projects', 'project', 'general', 'cards')
// The security card is a setting card; the illustration is not a card.
const EXEMPT = new Set(['SecurityInfoCard.vue', 'LoadingSpeedIllustration.vue'])
const SHELL = join(CARDS_DIR, 'SourceInfoCardShell.vue')
const PATTERN = /<info-card\b|<SourceInfoCardShell\b/
const COPY = /responsive-card|<v-card[\s>]|<v-card-title|<v-card-actions/
const LOCAL_LOOK = /^\.(?:source-title|installation-title|loading-speed-title)\b|^\.v-card-actions (?:\.v-btn|:deep\(\.v-btn\))|^\.v-card-text \{|^\.analytics-card \.v-card-text/m

const cards = readdirSync(CARDS_DIR)
  .filter(name => name.endsWith('.vue') && !EXEMPT.has(name))
  .map(name => join(CARDS_DIR, name))

describe('General info card contract', () => {
  it('finds the nine card files and the shell renders the pattern', () => {
    expect(cards).toHaveLength(9)
    expect(readFileSync(SHELL, 'utf8')).toContain('<info-card')
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('<v-col class="align-stretch d-flex responsive-card">')).toBe(true)
    expect(COPY.test('<v-card elevation="4">')).toBe(true)
    expect(COPY.test('<v-card-actions class="pt-0">')).toBe(true)
    expect(COPY.test('<info-card :title="title">')).toBe(false)
    expect(COPY.test('<v-card-text class="mb-4">')).toBe(false)
    expect(LOCAL_LOOK.test('.v-card-actions .v-btn {')).toBe(true)
    expect(LOCAL_LOOK.test('.v-card-actions :deep(.v-btn) {')).toBe(true)
    expect(LOCAL_LOOK.test('.v-card-text {\n  flex: 0 1 auto;')).toBe(true)
    expect(LOCAL_LOOK.test('.v-row {')).toBe(false)
    expect(PATTERN.test('<SourceInfoCardShell :actions="x">')).toBe(true)
  })

  it('each card renders the pattern (or the Source shell), without its own column, card, title or action rules', () => {
    const problems = cards.flatMap(file => {
      const text = readFileSync(file, 'utf8')
      const name = relative(ROOT, file)
      return [
        ...(PATTERN.test(text) ? [] : [`${name}: no <info-card> (or <SourceInfoCardShell>)`]),
        ...(COPY.test(text) ? [`${name}: a copy of the card frame`] : []),
        ...(LOCAL_LOOK.test(text) ? [`${name}: a local card rule`] : []),
      ]
    })
    expect(problems).toEqual([])
  })
})
