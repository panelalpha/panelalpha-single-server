// Contract test: a file drop zone is the kit `DropZone`, not its own `div.drop-zone` with drag handlers, a
// hidden `input type="file"` and a `.drop-zone` style. Three screens had copies (status issue upload, files upload version, onboarding
// zip step); one look now lives in the kit. A new zone written by hand would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const CONSUMERS = [
  join(SRC, 'entities', 'project', 'ui', 'status-issues', 'UploadArchiveWidget.vue'),
  join(SRC, 'views', 'projects', 'project', 'general', 'modals', 'FilesUploadVersionModal.vue'),
  join(SRC, 'views', 'onboarding', 'modals', 'OnboardingDeployFromZipModal.vue'),
]
// Other drop targets, not file drop zones: the overlay over the project list (no picker, no file list) and the image tiles of the
// Style Manager (other DOM in legacy, their logic goes to `useImageFileInput`).
const EXEMPT = new Set([
  join(SRC, 'views', 'projects', 'InstancesDropZone.vue'),
  join(SRC, 'views', 'style-manager', 'StyleManagerChangeLogo.vue'),
  join(SRC, 'views', 'style-manager', 'StyleManagerChangeFavicon.vue'),
])
const RAW = /@drop\b|@dragenter\b|type="file"|class="drop-zone"/
const COPY = /@drop\b|class="drop-zone"/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

// The top-level `<template>` block only (column 0), with HTML comments removed.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replace(/<!--[\s\S]*?-->/g, '')
}

function styleOf (text: string): string {
  return [...text.matchAll(/<style\b[\s\S]*?<\/style>/g)].map(match => match[0]).join('\n')
}

// `line` numbers of the template lines with own drop handling, a file input or the zone class.
function rawLines (text: string): number[] {
  return templateOf(text).split('\n').flatMap((line, index) => (RAW.test(line) ? [index + 1] : []))
}

function consumerProblems (file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const name = relative(ROOT, file)
  const problems: string[] = []
  if (!/<drop-zone\b|<DropZone\b/.test(templateOf(text))) {
    problems.push(`${name}: no <drop-zone> in the template`)
  }
  const lines = rawLines(text)
  if (lines.length > 0) {
    problems.push(`${name}: own drop handler, file input or drop-zone class in template line ${lines.join(', ')}`)
  }
  if (/\.drop-zone\b|\.selection-list\b/.test(styleOf(text))) {
    problems.push(`${name}: a drop zone rule in <style> (the look lives in DropZone.vue)`)
  }
  return problems
}

const files = [...walk(join(SRC, 'views')), ...walk(join(SRC, 'entities'))]

describe('drop zone contract', () => {
  it('scans the views and entities trees', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('knows the raw markup it must catch', () => {
    for (const sample of ['<div class="drop-zone" @click="x">', '<div @drop.prevent="x">', '<div @dragenter.prevent="x">', '<input type="file">']) {
      expect({ sample, caught: rawLines(`<template>\n${sample}\n</template>`).length > 0 }).toEqual({ sample, caught: true })
    }
    const pattern = '<drop-zone accept=".zip" @files="x" @remove="y" />'
    expect({ sample: pattern, caught: rawLines(`<template>\n${pattern}\n</template>`).length > 0 }).toEqual({ sample: pattern, caught: false })
  })

  it('each drop zone consumer uses the pattern, without its own zone, input or style', () => {
    expect(CONSUMERS.flatMap(file => consumerProblems(file))).toEqual([])
  })

  it('no other screen copies the drop zone', () => {
    const copies = files
      .filter(file => !CONSUMERS.includes(file) && !EXEMPT.has(file))
      .filter(file => COPY.test(templateOf(readFileSync(file, 'utf8'))))
      .map(file => `${relative(ROOT, file)}: own drop zone in the template`)
    expect(copies).toEqual([])
  })
})
