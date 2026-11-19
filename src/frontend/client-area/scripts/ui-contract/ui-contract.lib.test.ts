// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declaredVars, formatFileSummary, formatHit, formatTotal, gate, isAllowed, scanText, sourceFiles, stripNonValues, undeclaredVars, usedVars } from './ui-contract.ts'

const failing = (text: string, strict = false) => gate(scanText(text), { strict }).map(hit => `${hit.line}: ${hit.text}`)
const categories = (text: string, file?: string) => scanText(text, { file }).map(hit => hit.category)

describe('ui-contract lib: literals', () => {
  it('finds literals and skips comments, slot shorthands, anchors and url(//…)', () => {
    expect(failing('a {\n  color: #fff;\n}')).toEqual(['2: color: #fff;'])
    expect(failing('<v-icon color="#F44336" />')).toHaveLength(1)
    expect(failing('  box-shadow: 0 0 1px rgba(0, 0, 0, 0.2);')).toHaveLength(1)
    expect(failing('// V2 `#1E1E1E` surface\n/* rgba(0,0,0,.54) */\n<!-- #fff -->')).toEqual([])
    expect(failing('<template #add>\n<template #face="{ props }">\n<a href="#cafe">')).toEqual([])
    expect(failing(`const url = 'https://example.com/#section'`)).toEqual([])
    expect(failing('background: url(//cdn.example.com/a.png) #fff;')).toHaveLength(1)
    expect(failing('color: var(--v-red-base);')).toEqual([])
  })

  it('keeps line numbers when stripping', () => {
    expect(stripNonValues('a\n/* x\ny */\nb').split('\n')).toHaveLength(4)
    expect(failing('/* one\ntwo */\ncolor: #abc;')).toEqual(['3: color: #abc;'])
  })

  it('flags hsl and oklch, but not a token reference', () => {
    expect(failing('  background: hsl(120, 40%, 50%);')).toHaveLength(1)
    expect(failing('  background: hsla(120, 40%, 50%, .5);')).toHaveLength(1)
    expect(failing('  color: oklch(0.7 0.1 150);')).toHaveLength(1)
    expect(failing('  color: rgb(var(--v-theme-primary));')).toEqual([])
    expect(failing('  background: rgba(var(--v-theme-primary), 0.05);')).toEqual([])
    expect(failing('  background: rgba(7, 192, 126, 0.05);')).toHaveLength(1)
  })
})

describe('ui-contract lib: inline style', () => {
  it('fails only when strict', () => {
    for (const line of ['style="font-size: 22px !important"', `style='gap: 8px'`, ':style="labelStyle"', 'v-bind:style="labelStyle"']) {
      expect(failing(`  ${line}`)).toEqual([])
      expect(failing(`  ${line}`, true)).toHaveLength(1)
    }
    expect(failing('  data-style="x"', true)).toEqual([])
  })

  it('marks a literal inline style', () => {
    expect(scanText('<i style="width: 4px" />')[0]?.literal).toBe(true)
    expect(scanText('<i :style="labelStyle" />')[0]?.literal).toBe(false)
  })
})

describe('ui-contract lib: mdi and important counters', () => {
  it('reports mdi everywhere, also in the file manager', () => {
    expect(categories('<v-icon>mdi-close</v-icon>')).toEqual(['mdi'])
    expect(categories('<v-icon>mdi-close</v-icon>', 'src/views/hosting/file-manager/A.vue')).toEqual(['mdi'])
    expect(categories('<v-icon>mdi-close</v-icon>', 'src/views/account/A.vue')).toEqual(['mdi'])
  })

  it('skips !important in the legacy layer only', () => {
    expect(categories('a { margin: 0 !important; }')).toEqual(['important'])
    expect(categories('a { margin: 0 !important; }', 'src/app/styles/legacy/_x.scss')).toEqual([])
    expect(gate(scanText('a { margin: 0 !important; }  <v-icon>mdi-x</v-icon>'), { strict: true })).toEqual([])
  })
})

describe('ui-contract lib: tokens', () => {
  it('reads used names outside comments', () => {
    expect(usedVars('color: var(--v-red-base); /* var(--v-gone) */')).toEqual(['--v-red-base'])
  })

  it('reports names no stylesheet declares, ignoring Vuetify variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-contract-'))
    try {
      mkdirSync(join(dir, 'nested'))
      writeFileSync(join(dir, 'a.scss'), ':root { --v-red-base: #f00; }')
      writeFileSync(join(dir, 'nested', 'b.scss'), ':root{--v-sheet-surface:#fff}')
      const declared = declaredVars(dir)
      expect(declared.has('--v-red-base')).toBe(true)
      expect(declared.has('--v-sheet-surface')).toBe(true)
      expect(undeclaredVars('color: var(--v-red-base); color: var(--v-typo); color: rgb(var(--v-theme-primary)); top: var(--v-layout-top)', declared)).toEqual(['--v-typo'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('ui-contract lib: allow list', () => {
  it('matches the trimmed line', () => {
    const allow = ['style="resendWait ? resendWaitLabelStyle : undefined"']
    expect(isAllowed('          style="resendWait ? resendWaitLabelStyle : undefined"  ', allow)).toBe(true)
    expect(isAllowed('style="other"', allow)).toBe(false)
    expect(isAllowed('style="x"')).toBe(false)
  })
})

describe('ui-contract lib: scan output', () => {
  it('formats a hit, a per-file line and the total', () => {
    const hits = scanText('a {\n  color: #fff;\n  margin: 0 !important;\n}', { file: 'src/x.scss' })
    expect(formatHit('src/x.scss', hits[0]!)).toBe('src/x.scss:2: hex: color: #fff;')
    expect(formatFileSummary('src/x.scss', hits)).toBe('src/x.scss: 2 (hex=1 fn=0 inline-style=0 mdi=0 important=1)')
    expect(formatTotal(2)).toBe('SUMA: 2')
  })

  it('lists sources of a directory without tests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-scan-'))
    try {
      mkdirSync(join(dir, 'sub'))
      for (const name of ['a.vue', 'b.scss', 'c.ts', 'c.test.ts', 'd.png', 'sub/e.vue']) {
        writeFileSync(join(dir, name), '')
      }
      expect(sourceFiles(dir).map(path => path.slice(dir.length + 1))).toEqual(['a.vue', 'b.scss', 'c.ts', 'sub/e.vue'])
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})
