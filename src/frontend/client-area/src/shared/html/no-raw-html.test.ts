// Contract test: HTML reaches the DOM only through `v-safe-html` and `sanitizeHtml`. The ESLint rule `vue/no-v-html`
// covers the template side; this test also covers what a lint comment or a script could do around it.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..')
const ROOT = join(SRC, '..')
const OWNER_DIR = join(SRC, 'shared', 'html')
const SANITIZER = join(OWNER_DIR, 'sanitize-html.ts')

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return /\.(?:vue|[cm]?[jt]sx?)$/.test(entry.name) ? [path] : []
  })
}

// The one place that runs admin-written code on purpose: `custom_js_header`, `custom_css` and `custom_js_footer` from `/api/home` are a
// product feature, so they must execute and cannot be sanitized. They are the admin's own code on the admin's own panel,
// not data from a user or a third party. Nothing else may use these sinks; add a file here only with a reason and a Notes entry.
const EXECUTABLE_ADMIN_CODE = new Set([join(SRC, 'app', 'shell', 'app-head.ts')])

// Every way the codebase could put a string into the DOM as markup: the `v-html` directive, an `innerHTML` / `outerHTML` property in any
// spelling (`el.innerHTML =`, `el['innerHTML']`, `{ innerHTML }`, `:innerHTML.prop`, `inner-html`), `srcdoc`, and the DOM APIs that parse
// markup. Matched on code with comments removed, so a sentence about `v-html` in a comment is fine.
const SINKS = /v-html|inner-?html|outer-?html|\bsrcdoc\b|insertAdjacentHTML|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment|document\.write|domProps/i

/** Removes block comments, HTML comments and whole-line `//` comments. A trailing `// …` after code stays (URLs contain `//`). */
function stripComments (text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '')
}

const files = walk(SRC)
const production = files.filter(file => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
const outsideOwner = production.filter(file => !file.startsWith(OWNER_DIR + sep) && !EXECUTABLE_ADMIN_CODE.has(file))
// This file spells out the patterns it forbids.
const withoutThisTest = files.filter(file => file !== import.meta.filename)

function offenders (list: string[], pattern: RegExp, { comments = true }: { comments?: boolean } = {}): string[] {
  return list
    .filter(file => {
      const text = readFileSync(file, 'utf8')
      return pattern.test(comments ? text : stripComments(text))
    })
    .map(file => relative(ROOT, file))
}

describe('raw HTML contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(offenders(production, /\sv-safe-html(?::\w+)?=/).length).toBeGreaterThan(20)
  })

  it('knows the spellings of a sink it must catch', () => {
    for (const sample of [
      '<div v-html="x" />',
      '<div :innerHTML.prop="x" />',
      '<div :inner-html="x" />',
      '<div v-bind:innerHTML="x" />',
      '<div v-bind="{ innerHTML: x }" />',
      'el.innerHTML = x',
      'el.innerHTML += x',
      'el[\'innerHTML\'] = x',
      'h(\'div\', { innerHTML })',
      'h(\'div\', { \'innerHTML\': x })',
      'h(\'div\', { \'inner-html\': x })',
      'Object.assign(el, { innerHTML: x })',
      'el.outerHTML = x',
      'el.insertAdjacentHTML(\'beforeend\', x)',
      'el.setHTMLUnsafe(x)',
      'Document.parseHTMLUnsafe(x)',
      '<iframe :srcdoc="x" />',
      'range.createContextualFragment(x)',
      'document.write(x)',
      'h(\'div\', { domProps: { x } })',
    ]) {
      expect({ sample, caught: SINKS.test(sample) }).toEqual({ sample, caught: true })
    }
    expect(SINKS.test(stripComments('<!-- v-html -->\n/* innerHTML */\n// innerHTML = x\nconst a = 1'))).toBe(false)
  })

  it('has no HTML sink outside src/shared/html (templates, scripts, render functions)', () => {
    expect(offenders(outsideOwner, SINKS, { comments: false })).toEqual([])
  })

  it('has no `eslint-disable` that turns off `vue/no-v-html`, by name or for everything', () => {
    expect(offenders(withoutThisTest, /eslint-disable[^\n]*vue\/no-v-html/)).toEqual([])
    // A bare `/* eslint-disable */` or `<!-- eslint-disable -->` (no rule list, not `-next-line` or `-line`) switches the rule off too.
    expect(offenders(withoutThisTest, /eslint-disable(?!-next-line|-line)\s*(?:\*\/|-->|$)/m)).toEqual([])
  })

  it('keeps the admin custom-code exception to the one file that needs it', () => {
    for (const file of EXECUTABLE_ADMIN_CODE) {
      const code = stripComments(readFileSync(file, 'utf8'))
      expect(code).toContain('createContextualFragment')
      // The same file must not also write HTML with `innerHTML` and friends.
      expect(code).not.toMatch(/inner-?html|outer-?html|insertAdjacentHTML|document\.write|v-html/i)
    }
  })

  it('imports DOMPurify in one file only, statically or dynamically', () => {
    const importDompurify = /from\s+['"]dompurify['"]|\brequire\(\s*['"]dompurify['"]|\bimport\(\s*['"]dompurify['"]/
    expect(offenders(production.filter(file => file !== SANITIZER), importDompurify)).toEqual([])
    expect(offenders([SANITIZER], importDompurify)).toHaveLength(1)
  })

  it('keeps `vue/no-v-html` an error in the ESLint config', () => {
    expect(readFileSync(join(ROOT, 'eslint.config.js'), 'utf8')).toMatch(/'vue\/no-v-html':\s*'error'/)
  })

  it('lets every template that uses `v-safe-html` import the directive', () => {
    const missing = files
      .filter(file => file.endsWith('.vue'))
      .filter(file => {
        const text = readFileSync(file, 'utf8')
        return /\sv-safe-html(?::\w+)?=/.test(text) && !/import\s*\{\s*vSafeHtml\s*\}\s*from\s*'@\/shared\/html\/v-safe-html'/.test(text)
      })
      .map(file => relative(ROOT, file))
    expect(missing).toEqual([])
  })
})
