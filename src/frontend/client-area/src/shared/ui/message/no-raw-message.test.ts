// Contract test: an in-content message is `AppMessage` (or the presets `AuthMessage`, `AlertBox`, `ErrorCard`),
// not raw `.alert` / `.login-message` / `error-box` / `warning-box` / `.alert-box` markup or `v-alert`.
// Ten templates kept their own message boxes before this pattern; a new message written by hand would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNER_DIRS = [join(SRC, 'shared', 'ui', 'message'), join(SRC, 'shared', 'ui', 'alerts')]
const RAW_MESSAGE
  = /<v-alert\b|<VAlert\b|class=["'][^"']*\b(?:login-message|alert-box|error-box|warning-box)[ "']|class=["'](?:[^"']* )?alert[ "']|\balert--[a-z0-9]|\blogin-message--|['"](?:login-message|alert-box|error-box|warning-box|alert)['"]\s*:/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed. `<style>` and `<script>` are not scanned.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replace(/<!--[\s\S]*?-->/g, '')
}

// `file:line` of every raw message tag in the template of a component.
function rawMessageLines (text: string): number[] {
  return templateOf(text).split('\n').flatMap((line, index) => (RAW_MESSAGE.test(line) ? [index + 1] : []))
}

function offenders (files: string[]): string[] {
  return files.flatMap(file => {
    const lines = rawMessageLines(readFileSync(file, 'utf8'))
    return lines.length > 0 ? [`${relative(ROOT, file)} (use AppMessage): template line ${lines.join(', ')}`] : []
  })
}

const files = walk(SRC).filter(file => !OWNER_DIRS.some(dir => file.startsWith(dir + '/')))

describe('message contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    const uses = files.filter(file => /<(?:AppMessage|AuthMessage|AlertBox|ErrorCard)\b/.test(readFileSync(file, 'utf8')))
    expect(uses.length).toBeGreaterThanOrEqual(30)
  })

  it('knows the spellings of a raw message it must catch', () => {
    for (const sample of [
      '<v-alert type="info" />',
      '<div class="alert alert--error">',
      '<div class="login-message login-message--error">',
      '<div class="error-box mt-5">',
      '<div class="warning-box">',
      '<div class="alert-box">',
      '<div class=\'alert\'>',
      '<div class="mt-2 alert">',
      '<div class="alert--info-bg alert--sm">',
      '<div class="login-message--error">',
      '<div :class="{ \'error-box\': failed }">',
    ]) {
      expect({ sample, caught: rawMessageLines(`<template>\n${sample}\n</template>`).length > 0 }).toEqual({ sample, caught: true })
    }
    for (const sample of ['<AppMessage variant="error" />', '<div class="alert-header">', '<div class="alert-sm">', '<p class="login-message__desc">']) {
      const caught = rawMessageLines(`<template>\n${sample}\n</template>`).length > 0
      expect({ sample, caught }).toEqual({ sample, caught: false })
    }
  })

  it('has no raw message in a template outside the pattern', () => {
    expect(offenders(files)).toEqual([])
  })

  it('does not look at comments and styles, and the owner dirs are the pattern and the alerts kit', () => {
    expect(rawMessageLines('<template>\n  <!-- <v-alert /> -->\n  <p />\n</template>\n<style>.alert {}</style>')).toEqual([])
    expect(OWNER_DIRS.map(dir => dir.split('/').pop())).toEqual(['message', 'alerts'])
  })
})
