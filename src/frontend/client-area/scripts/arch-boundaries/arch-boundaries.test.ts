// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// Contract test of the import boundaries (change `arch-boundaries-lint`, architecture-review pt 6 and 7). Direction `app -> views ->
// entities -> shared`; the groups of `src/views/` do not import each other, except Advanced of a project -> hosting; imports go through
// `@/`, never `../`. `eslint.config.js` enforces it for code; this test proves each rule fires (and the exceptions pass) and covers
// the stylesheets, which ESLint does not read (`<style src>`, `@use`).
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('import boundaries: ESLint rules', () => {
  let eslint: ESLint

  beforeAll(() => {
    eslint = new ESLint({ cwd: rootDir })
  }, 60_000)

  async function messages (filePath: string, code: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath: join(rootDir, filePath) })
    return result!.messages.filter(message => message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-syntax').map(message => message.message)
  }

  const tsFile = (importLine: string) => `${importLine}\nexport const marker = 1\n`

  const violations: Array<[string, string, string, RegExp]> = [
    ['shared imports an entity', 'src/shared/api/probe.ts', `import { x } from '@/entities/project/x'`, /shared\/ must not import entities/],
    ['shared imports a view', 'src/shared/api/probe.ts', `import { x } from '@/views/auth/x'`, /must not import view code/],
    ['shared imports the app shell', 'src/shared/api/probe.ts', `import { x } from '@/app/router'`, /outside src\/app\/ must not import the app shell/],
    ['kit imports session', 'src/shared/ui/buttons/probe.ts', `import { x } from '@/shared/session/session.store'`, /props-only/],
    ['kit imports an entity', 'src/shared/ui/buttons/probe.ts', `import { x } from '@/entities/project/x'`, /knows no domain/],
    ['kit imports axios', 'src/shared/ui/buttons/probe.ts', `import axios from 'axios'`, /props-only/],
    ['kit imports the app shell', 'src/shared/ui/buttons/probe.ts', `import { x } from '@/app/router'`, /app shell/],
    ['entity imports a view', 'src/entities/project/probe.ts', `import { x } from '@/views/projects/x'`, /entities\/ must not import view code/],
    ['entity imports the app shell', 'src/entities/project/probe.ts', `import { x } from '@/app/router'`, /entities\/ must not import the app shell/],
    ['app imports a view', 'src/app/shell/probe.ts', `import { x } from '@/views/projects/x'`, /must not import view code/],
    ['router imports a view that is not a route module', 'src/app/router/index.ts', `import { x } from '@/views/auth/LoginView.vue'`, /only the `\*\.routes` modules/],
    ['view imports another group', 'src/views/auth/probe.ts', `import { x } from '@/views/account/x'`, /does not import another one/],
    ['view imports another group (type)', 'src/views/auth/probe.ts', `import type { X } from '@/views/account/x'`, /does not import another one/],
    ['view imports the app shell', 'src/views/auth/probe.ts', `import { x } from '@/app/router'`, /must not import the app shell/],
    ['hosting imports projects (the exception goes one way only)', 'src/views/hosting/probe.ts', `import { x } from '@/views/projects/x'`, /does not import another one/],
    ['project outside Advanced imports hosting', 'src/views/projects/project/general/probe.ts', `import { x } from '@/views/hosting/x'`, /does not import another one/],
    ['Advanced imports another group than hosting', 'src/views/projects/project/advanced/cron/probe.ts', `import { x } from '@/views/account/x'`, /does not import another one/],
    ['Advanced test imports another group than hosting', 'src/views/projects/project/advanced/cron/probe.test.ts', `import { x } from '@/views/account/x'`, /does not import another one/],
    ['route module imports a view statically', 'src/views/auth/auth.routes.ts', `import LoginView from '@/views/auth/LoginView.vue'`, /load lazily/],
    ['route module imports another group', 'src/views/auth/auth.routes.ts', `import { x } from '@/views/account/x'`, /does not import another one/],
    ['relative parent import', 'src/views/auth/login/probe.ts', `import { x } from '../x'`, /alias/],
    ['relative parent import in a test', 'src/views/auth/login/probe.test.ts', `import { x } from '../x'`, /alias/],
    ['relative parent import in shared', 'src/shared/api/probe.ts', `export * from '../x'`, /alias/],
    ['relative parent import in app', 'src/app/shell/probe.ts', `import { x } from '../../x'`, /alias/],
    ['relative parent import of a type', 'src/entities/project/probe.ts', `import type { X } from '../x'`, /alias/],
    ['dynamic relative parent import', 'src/views/auth/login/probe.ts', `export const load = () => import('../x')`, /alias/],
    ['relative parent vi.mock', 'src/views/auth/login/probe.test.ts', `vi.mock('../x', () => ({}))`, /alias/],
    ['relative parent vi.importActual', 'src/views/auth/login/probe.test.ts', `export const a = vi.importActual('../x')`, /alias/],
    ['the preset selector survives (const enum)', 'src/views/auth/probe.ts', `export const enum Probe { A }`, /./],
  ]

  it.each(violations)('rejects: %s', async (_name, filePath, line, expected) => {
    const found = await messages(filePath, tsFile(line))
    expect(found.filter(message => expected.test(message))).not.toEqual([])
  }, 30_000)

  it('rejects a view group import from a Vue SFC script', async () => {
    const found = await messages('src/views/auth/Probe.vue', `<script lang="ts" setup>\nimport { x } from '@/views/account/x'\nconsole.log(x)\n</script>\n<template><div /></template>\n`)
    expect(found.some(message => /does not import another one/.test(message))).toBe(true)
  }, 30_000)

  const allowed: Array<[string, string, string]> = [
    ['Advanced imports hosting (the one exception)', 'src/views/projects/project/advanced/cron/probe.ts', `import { x } from '@/views/hosting/cron/x'`],
    ['Advanced test imports hosting', 'src/views/projects/project/advanced/cron/probe.test.ts', `import { x } from '@/views/hosting/cron/x'`],
    ['Advanced imports its own group', 'src/views/projects/project/advanced/cron/probe.ts', `import { x } from '@/views/projects/project/instance.store'`],
    ['a view imports its own group, an entity and shared', 'src/views/hosting/probe.ts', `import { x } from '@/views/hosting/x'\nimport { y } from '@/entities/project/y'\nimport { z } from '@/shared/api/client'`],
    ['a view test builds a router from the shell', 'src/views/auth/probe.test.ts', `import { x } from '@/app/router'`],
    ['a shared test builds Vuetify from the shell', 'src/shared/ui/icons/probe.test.ts', `import { x } from '@/app/plugins/vuetify'`],
    ['an entity imports shared and its own entity', 'src/entities/project/probe.ts', `import { x } from '@/shared/api/client'\nimport { y } from '@/entities/domain/y'`],
    ['app imports an entity and shared', 'src/app/shell/probe.ts', `import { x } from '@/entities/project/x'\nimport { y } from '@/shared/api/client'`],
    ['the router imports route modules', 'src/app/router/index.ts', `import { routes } from '@/views/auth/auth.routes'`],
    ['App.vue is the composition root', 'src/app/App.vue', `<script lang="ts" setup>\nimport X from '@/views/onboarding/OnboardingModalWrapper.vue'\nconsole.log(X)\n</script>\n<template><div /></template>\n`],
    ['a route module loads its view lazily', 'src/views/auth/auth.routes.ts', `export const component = () => import('@/views/auth/LoginView.vue')`],
    ['a sibling import', 'src/views/auth/login/probe.ts', `import { x } from './x'`],
    ['the kit imports shared and its own folder', 'src/shared/ui/buttons/probe.ts', `import { x } from '@/shared/format/x'\nimport { y } from './y'`],
    ['an alias vi.mock', 'src/views/auth/login/probe.test.ts', `vi.mock('@/shared/api/client', () => ({}))`],
  ]

  it.each(allowed)('accepts: %s', async (_name, filePath, line) => {
    const code = filePath.endsWith('.vue') ? line : tsFile(line)
    expect(await messages(filePath, code)).toEqual([])
  }, 30_000)
})

// Stylesheets: `<style src="…">` in components and `@use` / `@forward` / `@import` in `.scss`. ESLint does not read them.
describe('import boundaries: stylesheets', () => {
  const srcDir = join(rootDir, 'src')
  const TOKENS = '@/app/styles/legacy/tokens/'

  function walk (directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        return walk(path)
      }
      return /\.(?:vue|scss)$/.test(entry.name) ? [path] : []
    })
  }

  const specifiers = /(?:@use|@forward|@import)\s+['"]([^'"]+)['"]|<style[^>]*\ssrc="([^"]+)"/g

  function imports (file: string): string[] {
    const text = readFileSync(file, 'utf8')
    return [...text.matchAll(specifiers)].map(match => (match[1] ?? match[2])!)
  }

  const layerOf = (path: string) => /^src\/(app|views|entities|shared)\//.exec(path)?.[1] ?? 'other'
  const groupOf = (path: string) => /^src\/views\/([^/]+)\//.exec(path)?.[1] ?? null

  const files = walk(srcDir).map(file => ({ file, path: relative(rootDir, file).split(sep).join(posix.sep) }))

  it('finds stylesheets to check', () => {
    expect(files.some(({ path }) => path.endsWith('.scss'))).toBe(true)
    expect(files.flatMap(({ file }) => imports(file)).length).toBeGreaterThan(50)
  })

  it('uses the `@/` alias, not `../`, in `<style src>` and `@use`', () => {
    const relativeImports = files.flatMap(({ file, path }) => imports(file).filter(spec => spec.startsWith('../')).map(spec => `${path}: ${spec}`))
    expect(relativeImports).toEqual([])
  })

  it('keeps the layer direction in stylesheets (tokens of src/app/styles/legacy/tokens are the known exception)', () => {
    const wrong: string[] = []
    for (const { file, path } of files) {
      const layer = layerOf(path)
      for (const spec of imports(file)) {
        if (!spec.startsWith('@/')) {
          continue
        }
        const target = `src/${spec.slice(2)}`
        const targetLayer = layerOf(target)
        const isToken = spec.startsWith(TOKENS)
        const upward = (layer === 'shared' && ['entities', 'views', 'app'].includes(targetLayer))
          || (layer === 'entities' && ['views', 'app'].includes(targetLayer))
          || (layer === 'views' && targetLayer === 'app')
        const crossGroup = layer === 'views' && targetLayer === 'views' && groupOf(path) !== groupOf(target)
          && !(path.startsWith('src/views/projects/project/advanced/') && groupOf(target) === 'hosting')
        if ((upward && !isToken) || crossGroup) {
          wrong.push(`${path}: ${spec}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})
