import { readdirSync } from 'node:fs'
import vuetify from 'eslint-config-vuetify'

const config = await vuetify()

export default [
  {
    ignores: ['.cursor/**', 'context/**', 'dist/**'],
  },
  ...config,
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,jsx}'],
    rules: {
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectLegacyClasses'] }],
    },
  },
  {
    // HTML is rendered with `v-safe-html` (src/shared/html, sec-html-sanitize); raw `v-html` is an error everywhere in src.
    // `src/shared/html/no-raw-html.test.ts` also fails on `innerHTML`, a second DOMPurify import and any `eslint-disable` of this rule.
    files: ['src/**/*.vue'],
    rules: {
      'vue/no-v-html': 'error',
    },
  },
  {
    // Import order of the alias groups: `@/app`, `@/views`, `@/entities`, then the rest (`@/shared`). Before arch-views the folder was
    // `@/features`, which the alphabetical sort kept between `@/app` and `@/shared`. `@/views` would sort after `@/shared`, and the order
    // of static imports is the order in which components (and their scoped CSS) are evaluated, so the rename would change the cascade
    // order in `dist/assets/*.css` (found by the CSS comparison of arch-views). The same holds for `@/entities` (arch-entities): its
    // group is listed on purpose, so the order does not depend on how the letters happen to sort (type imports stay in the group of the other
    // internal types, as before). Everything else is the preset's order (eslint-config-vuetify).
    files: ['**/*.{ts,vue,js,mjs}'],
    rules: {
      'perfectionist/sort-imports': ['error', {
        groups: [
          'type-app',
          'type-views',
          'type',
          ['type-parent', 'type-sibling', 'type-index', 'type-internal', 'type-entities'],
          'builtin',
          'external',
          'value-app',
          'value-views',
          'value-entities',
          'internal',
          ['parent', 'sibling', 'index'],
          'side-effect',
          'unknown',
        ],
        customGroups: [
          { groupName: 'type-app', selector: 'type', elementNamePattern: '^@/app/' },
          { groupName: 'type-views', selector: 'type', elementNamePattern: '^@/views/' },
          { groupName: 'type-entities', selector: 'type', elementNamePattern: '^@/entities/' },
          { groupName: 'value-app', selector: 'internal', elementNamePattern: String.raw`^@/app/(?!.*\.s?css$)` },
          { groupName: 'value-views', selector: 'internal', elementNamePattern: String.raw`^@/views/(?!.*\.s?css$)` },
          { groupName: 'value-entities', selector: 'internal', elementNamePattern: String.raw`^@/entities/(?!.*\.s?css$)` },
        ],
        newlinesBetween: 'ignore',
        order: 'asc',
        type: 'natural',
      }],
    },
  },
  ...boundaryBlocks(),
]

/**
 * Import boundaries (arch-boundaries-lint; architecture-review pt 6 and 7).
 *
 * Direction `app -> views -> entities -> shared`, and the groups of `src/views/` (the first directory under it) do not import each other.
 * The one exception is Advanced of a project -> hosting (`src/views/projects/project/advanced/**` may import `@/views/hosting/**`): the
 * Advanced pages are thin wrappers over the hosting pages that My server shares. Imports go through `@/`, never `../`.
 *
 * In flat config a later block replaces the options of an earlier block for the same rule, so every set of files gets its complete list of
 * patterns in one block. The blocks below are disjoint, except the base block (only `../`), which every other block replaces for its files;
 * files left out of a block (`ignores`) keep the base block. `scripts/arch-boundaries/arch-boundaries.test.ts` proves each rule.
 * ESLint does not read `.scss` and `<style>`: the tokens `@use '@/app/styles/legacy/tokens/*'` from shared/, entities/ and views/ are the
 * known exception to "no `@/app` outside app/" (AGENTS.md), and the same test checks the stylesheets.
 */
function boundaryBlocks () {
  const SRC_CODE = 'src/**/*.{ts,vue}'
  const TESTS = '**/*.test.ts'
  const ROUTES = '**/*.routes.ts'

  const relative = {
    regex: String.raw`^\.\.(?:/|$)`,
    message: 'Import through the `@/` alias, not `../` (AGENTS.md, imports).',
  }
  const noViews = { group: ['@/views/*'], message: 'shared/ and app/ must not import view code; move the shared piece to src/shared/.' }
  const noEntities = { group: ['@/entities/*'], message: 'shared/ must not import entities; move the shared piece to src/entities/ or pass the data in.' }
  const noApp = { group: ['@/app/*'], message: 'Code outside src/app/ must not import the app shell; take it through props, events or shared/.' }
  const staticView = { group: ['**/*.vue'], message: 'Route views load lazily: use `component: () => import(\'…View.vue\')`, not a static import (bundle size, perf-lazy-routes).' }
  const kitPaths = [
    { name: 'axios', message: 'Kit components are props-only; HTTP belongs in <name>.api.ts.' },
    { name: 'vue-router', message: 'Kit components emit events; the screen navigates.' },
  ]
  const kitPatterns = [
    { group: ['@/views/*'], message: 'The kit must not import view code; take data through props or slots.' },
    { group: ['@/entities/*'], message: 'The kit knows no domain; move the component to src/entities/<thing>/ui/ or take data through props.' },
    { group: ['@/shared/session/*'], message: 'Kit components are props-only; session state comes through props.' },
    { group: ['@/shared/api/*'], message: 'Kit components are props-only; HTTP belongs in <name>.api.ts.' },
  ]

  const restrict = (files, patterns, { ignores, paths } = {}) => ({
    files: Array.isArray(files) ? files : [files],
    ...(ignores ? { ignores } : {}),
    rules: { 'no-restricted-imports': ['error', { ...(paths ? { paths } : {}), patterns }] },
  })

  // Groups of src/views/: the first directory under it (`account/` is one group: the user menu).
  const groups = readdirSync('src/views', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  // Zones: where the same set of allowed groups holds. The zone of the exception is carved out of `projects/`.
  const ADVANCED = 'src/views/projects/project/advanced'
  const zones = groups.map(group => group === 'projects'
    ? { files: 'src/views/projects/**', ignores: [`${ADVANCED}/**`], allowed: ['projects'] }
    : { files: `src/views/${group}/**`, allowed: [group] })
  zones.push({ files: `${ADVANCED}/**`, allowed: ['projects', 'hosting'] })
  const viewsBlocks = zones.flatMap(({ files, ignores = [], allowed }) => {
    const otherGroups = {
      regex: `^@/views/(?!(?:${allowed.join('|')})(?:/|$))`,
      message: `A view group does not import another one (${allowed.join(', ')} here); the only exception is Advanced of a project -> hosting. Move the shared piece to entities/ or shared/.`,
    }
    const code = (extra = []) => [relative, otherGroups, ...extra]
    return [
      // tests may reach into the shell (`@/app/router`) to build a router
      restrict(`${files}/*.test.ts`, code(), { ignores }),
      restrict(`${files}/*.{ts,vue}`, code([noApp]), { ignores: [...ignores, TESTS, ROUTES] }),
      restrict(`${files}/*.routes.ts`, code([noApp, staticView]), { ignores }),
    ]
  })

  return [
    // base: every file in src/
    restrict(SRC_CODE, [relative]),
    // app/: no view code except the named exceptions (they keep the base block)
    restrict('src/app/**/*.{ts,vue}', [relative, noViews], {
      ignores: [
        'src/app/router/index.ts', // only `*.routes` modules, see below
        'src/app/App.vue', // composition root: onboarding, Style Manager drawer, retry-install
        'src/app/router/document-title.ts', // reads instance.store
        'src/app/router/document-title.test.ts',
        'src/app/router/root-redirect.test.ts',
      ],
    }),
    // The router composes the routes of the views and nothing else from views.
    restrict('src/app/router/index.ts', [
      relative,
      { regex: String.raw`^@/views/(?!.*\.routes$)`, message: 'The router may import only the `*.routes` modules of views.' },
    ]),
    // shared/ knows no domain: no entities, views, or the app shell (tests may build the Vuetify instance from `@/app/plugins/vuetify`).
    restrict('src/shared/**/*.{ts,vue}', [relative, noViews, noEntities], { ignores: ['src/shared/ui/**'] }),
    restrict('src/shared/**/*.{ts,vue}', [relative, noViews, noEntities, noApp], { ignores: ['src/shared/ui/**', TESTS] }),
    // The shared UI kit is props-only (F-06 plan, contract rules). language/ predates the kit and is app-shell chrome: it follows the
    // shared/ rule above until it moves.
    restrict('src/shared/ui/**/*.{ts,vue}', [relative, ...kitPatterns], { ignores: ['src/shared/ui/language/**'], paths: kitPaths }),
    restrict('src/shared/ui/**/*.{ts,vue}', [relative, ...kitPatterns, noApp], { ignores: ['src/shared/ui/language/**', TESTS], paths: kitPaths }),
    // entities/ know their domain and shared/, not the screens or the shell.
    restrict('src/entities/**/*.{ts,vue}', [
      relative,
      { group: ['@/views/*'], message: 'entities/ must not import view code; the screen composes the entity, not the other way round.' },
      { group: ['@/app/*'], message: 'entities/ must not import the app shell; take it through props, events or shared/.' },
    ]),
    ...viewsBlocks,
    // `import()` and `vi.mock()` are not covered by no-restricted-imports. The preset's own selector (`TSEnumDeclaration[const=true]`)
    // stays: this block replaces the rule's options for src/.
    {
      files: [SRC_CODE],
      rules: {
        'no-restricted-syntax': [
          'error',
          'TSEnumDeclaration[const=true]',
          { selector: String.raw`ImportExpression[source.value=/^\.\.(\W|$)/]`, message: 'Import through the `@/` alias, not `../` (AGENTS.md, imports).' },
          {
            selector: String.raw`CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock|importActual|importMock|unmock)$/][arguments.0.value=/^\.\.(\W|$)/]`,
            message: 'Mock through the `@/` alias, not `../` (AGENTS.md, imports).',
          },
        ],
      },
    },
  ]
}
