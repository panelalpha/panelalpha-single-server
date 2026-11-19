// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileString } from 'sass-embedded'
import { describe, expect, it } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { V2_SELECTORS } from '@/app/styles/v2-selectors'

const srcDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sharedUiDir = resolve(srcDir, 'shared/ui')
// The components of the entities (`entities/<thing>/ui/`) used to be part of the kit, so they stay under the same guard.
const entitiesDir = resolve(srcDir, 'entities')
// Same for `views/hosting/ui/` (the hosting components shared by the pages of My server and the project's Advanced).
const roots = [sharedUiDir, entitiesDir, resolve(srcDir, 'views/hosting/ui')]
const settingsDir = resolve(srcDir, 'app/styles')

/**
 * Allowlist: selector fragment to reason (only for selectors valid in V4 too). Key is the
 * file path relative to src/shared/ui/, src/entities/ or src/views/hosting/ui/ (`.scss`) or `<file>#<style block index>` (SFC).
 */
const ALLOWLIST: Record<string, Partial<Record<(typeof V2_SELECTORS)[number], string>>> = {
  'auth-frame/auth-screen.scss': {
    '.v-card__': 'V4 `.v-card__overlay` / `.v-card__underlay`, excluded from the last-child radius',
  },
}

function walk (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      return walk(full)
    }
    return [full]
  })
}

function rewriteAtUse (source: string, fromFile: string): string {
  return source.replace(
    /@use\s+['"]@\/([^'"]+)['"](\s+as\s+(\w+))?/g,
    (_m, rel: string, _asPart: string | undefined, alias: string | undefined) => {
      const abs = resolve(srcDir, rel)
      let relPath = relative(resolve(fromFile, '..'), abs).replace(/\\/g, '/')
      if (!relPath.startsWith('.')) {
        relPath = './/' + relPath
      }
      return alias ? `@use '${relPath}' as ${alias}` : `@use '${relPath}'`
    },
  )
}

function compileScss (source: string, fromFile: string): string {
  const rewritten = rewriteAtUse(source, fromFile)
  return compileString(rewritten, {
    url: new URL(`file://${fromFile}`),
    loadPaths: [settingsDir, srcDir, resolve(fromFile, '..')],
  }).css
}

function v2Hits (css: string, fileKey: string): string[] {
  const allowed = ALLOWLIST[fileKey] ?? {}
  return V2_SELECTORS.filter(fragment => {
    if (allowed[fragment]) {
      return false
    }
    return css.includes(fragment)
  })
}

function extractVueStyles (file: string): string[] {
  const raw = readFileSync(file, 'utf8')
  const { descriptor } = parse(raw, { filename: file })
  return descriptor.styles.map(style => {
    // Fail instead of skipping, so a block in another language is never left unchecked.
    if (style.lang && style.lang !== 'scss') {
      throw new Error(`${file}: <style lang="${style.lang}"> is not checked by kit-styles.test.ts`)
    }
    return style.content
  })
}

describe('kit styles', () => {
  const sources = roots.flatMap(root => walk(root).map(file => ({ file, root })))
  const scssFiles = sources.filter(({ file }) => file.endsWith('.scss'))
  const vueFiles = sources.filter(({ file }) => file.endsWith('.vue'))

  it('finds the kit sources (guards against a broken path passing vacuously)', () => {
    expect(scssFiles.length).toBeGreaterThan(0)
    expect(vueFiles.length).toBeGreaterThan(0)
  })

  it('compiles every .scss under src/shared/ui/, src/entities/ and src/views/hosting/ui/ without V2 selectors', () => {
    const hits: Record<string, string[]> = {}
    for (const { file, root } of scssFiles) {
      const key = relative(root, file).replace(/\\/g, '/')
      const found = v2Hits(compileScss(readFileSync(file, 'utf8'), file), key)
      if (found.length > 0) {
        hits[key] = found
      }
    }
    expect(hits).toEqual({})
  })

  it('compiles every SFC style lang=scss under src/shared/ui/, src/entities/ and src/views/hosting/ui/ without V2 selectors', () => {
    const hits: Record<string, string[]> = {}
    let compiled = 0
    for (const { file, root } of vueFiles) {
      const key = relative(root, file).replace(/\\/g, '/')
      for (const [index, block] of extractVueStyles(file).entries()) {
        // Empty blocks are `<style src>`: the referenced .scss is checked by the test above.
        if (!block.trim()) {
          continue
        }
        compiled++
        const found = v2Hits(compileScss(block, file), `${key}#${index}`)
        if (found.length > 0) {
          hits[`${key}#${index}`] = found
        }
      }
    }
    expect(compiled).toBeGreaterThan(0)
    expect(hits).toEqual({})
    // Compiles every kit SFC in turn: alone it runs well under a minute, in the full parallel run it went past 60 s.
  }, 180_000)
})
