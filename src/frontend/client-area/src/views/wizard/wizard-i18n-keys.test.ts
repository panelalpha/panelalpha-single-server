import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Copy of the wizard (`setup.wizard.*`): the keys are new, the backend has none of them yet, so every use in a
// view carries the English text as `defaultValue`. This test keeps that so: a `t('setup.wizard.…')` without `defaultValue` fails, and so
// does a key that is not on the list below. When the backend adds a key, the fixture gets it and the key leaves `MISSING_ON_DEPLOY`.

const here = dirname(fileURLToPath(import.meta.url))
// src/views/wizard → package root (3 levels up).
const fixture = join(here, '../../../parity/fixtures/lite/translation.en.json')

type Flat = Record<string, string>

function flatten (node: unknown, prefix = '', out: Flat = {}): Flat {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out)
    }
  } else if (prefix) {
    out[prefix] = String(node)
  }
  return out
}

const lite = flatten(JSON.parse(readFileSync(fixture, 'utf8')))
const hasKey = (key: string) => key in lite || `${key}_one` in lite || `${key}_other` in lite

const BENEFITS = ['monitoring', 'login', 'servers', 'go']
const CARD_BENEFITS = ['remote', 'login', 'social', 'go']
const AI_CHECKS = ['projects', 'logs', 'revoke']
const FAILURES = ['denied', 'expired', 'unreachable', 'unsupported', 'pending']

/** Every `setup.wizard.*` key of the wizard (the dynamic ones are expanded: benefits, Connect failures, Summary lines). */
const WIZARD_KEYS = [
  'setup.wizard.checker.length',
  'setup.wizard.checker.lowercase',
  'setup.wizard.checker.met',
  'setup.wizard.checker.notMet',
  'setup.wizard.checker.number',
  'setup.wizard.checker.symbol',
  'setup.wizard.checker.title',
  'setup.wizard.checker.uppercase',
  ...CARD_BENEFITS.map(key => `setup.wizard.connect.card.benefits.${key}`),
  'setup.wizard.connect.card.button',
  'setup.wizard.connect.card.flag',
  'setup.wizard.connect.card.title',
  'setup.wizard.connect.checkAgain',
  'setup.wizard.connect.chooseHeading',
  'setup.wizard.connect.chooseSub',
  'setup.wizard.connect.completingTitle',
  'setup.wizard.connect.diagram.alt',
  ...FAILURES.map(key => `setup.wizard.connect.failure.${key}`),
  'setup.wizard.connect.localLink',
  'setup.wizard.connect.localPrompt',
  'setup.wizard.connect.tryAgain',
  'setup.wizard.connect.useLocal',
  'setup.wizard.footer.next',
  'setup.wizard.footer.previous',
  'setup.wizard.general.accountHeading',
  'setup.wizard.general.confirmLabel',
  'setup.wizard.general.confirmPlaceholder',
  'setup.wizard.general.emailHint',
  'setup.wizard.general.emailLabel',
  'setup.wizard.general.emailPlaceholder',
  'setup.wizard.general.hidePassword',
  'setup.wizard.general.nameLabel',
  'setup.wizard.general.namePlaceholder',
  'setup.wizard.general.passwordLabel',
  'setup.wizard.general.passwordPlaceholder',
  'setup.wizard.general.readonlyHint',
  'setup.wizard.general.serverNameDefault',
  'setup.wizard.general.serverNameHeading',
  'setup.wizard.general.serverNameLabel',
  'setup.wizard.general.showPassword',
  'setup.wizard.hub.connected',
  'setup.wizard.hub.description',
  'setup.wizard.hub.serverNameLabel',
  'setup.wizard.hub.signedInAs',
  'setup.wizard.hub.title',
  'setup.wizard.hub.useAnother',
  'setup.wizard.local.back',
  'setup.wizard.local.hubLink',
  'setup.wizard.local.lead',
  'setup.wizard.start.button',
  'setup.wizard.start.subtitle',
  'setup.wizard.start.title',
  'setup.wizard.connectAi.card.flag',
  'setup.wizard.connectAi.card.flagConnected',
  'setup.wizard.connectAi.card.title',
  ...AI_CHECKS.map(key => `setup.wizard.connectAi.card.checks.${key}`),
  'setup.wizard.connectAi.connected',
  'setup.wizard.connectAi.createAnother',
  'setup.wizard.connectAi.createToken',
  'setup.wizard.connectAi.description',
  'setup.wizard.connectAi.diagram.assistant',
  'setup.wizard.connectAi.diagram.link',
  'setup.wizard.connectAi.diagram.server',
  'setup.wizard.connectAi.documentation',
  'setup.wizard.connectAi.later',
  'setup.wizard.connectAi.serverAddress',
  'setup.wizard.connectAi.skip',
  'setup.wizard.connectAi.title',
  'setup.wizard.steps.closedHint',
  'setup.wizard.steps.connectAi',
  'setup.wizard.steps.done',
  'setup.wizard.steps.label',
  'setup.wizard.steps.serverName',
  'setup.wizard.steps.signIn',
  'setup.wizard.summary.adminEmail',
  'setup.wizard.summary.ai',
  'setup.wizard.summary.aiConnected',
  'setup.wizard.summary.aiNotConnected',
  'setup.wizard.summary.createFirstProject',
  'setup.wizard.summary.description',
  'setup.wizard.summary.documentation',
  'setup.wizard.summary.editionCommunity',
  'setup.wizard.summary.hub',
  'setup.wizard.summary.hubAccount',
  'setup.wizard.summary.hubConnected',
  'setup.wizard.summary.hubLater',
  'setup.wizard.summary.hubNotConnected',
  ...BENEFITS.map(key => `setup.wizard.summary.included.${key}`),
  'setup.wizard.summary.includedWithHub',
  'setup.wizard.summary.panelAddress',
  'setup.wizard.summary.serverName',
  'setup.wizard.summary.settingsLink',
  'setup.wizard.summary.title',
  'setup.wizard.summary.version',
]

/** Keys the deploy does not have (the backend has no `setup.wizard.*` yet; fixture of 2026-10-30). All of them, with `defaultValue` in the view. */
const MISSING_ON_DEPLOY = new Set<string>(WIZARD_KEYS)

function sourceFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'assets' ? [] : sourceFiles(path)
    }
    return /\.(?:vue|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

const sources = sourceFiles(here).map(path => ({ path, text: readFileSync(path, 'utf8') }))

/** The text of the `t(…)` call that starts at `start` (the index of `t`), up to the matching `)`. */
function callText (text: string, start: number): string {
  let depth = 0
  for (let i = text.indexOf('(', start); i < text.length; i++) {
    if (text[i] === '(') {
      depth++
    } else if (text[i] === ')' && --depth === 0) {
      return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}

describe('wizard i18n keys', () => {
  it('lists each key without duplicates', () => {
    expect(new Set(WIZARD_KEYS).size).toBe(WIZARD_KEYS.length)
  })

  it('gives every t(setup.wizard.*) call a defaultValue', () => {
    const missing: string[] = []
    let calls = 0
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/\bt\(\s*[`'"]setup\.wizard\./g)) {
        calls++
        if (!callText(text, match.index).includes('defaultValue')) {
          missing.push(`${path}:${text.slice(0, match.index).split('\n').length}`)
        }
      }
    }
    expect(calls).toBeGreaterThan(40)
    expect(missing).toEqual([])
  })

  it('has every key used in the sources on the list', () => {
    const unlisted: string[] = []
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/[`'"](setup\.wizard\.[\w.]*)(\$\{)?/g)) {
        const key = match[1]!
        // A key that ends with `.` or goes on with `${` is a prefix of dynamic keys.
        const isPrefix = key.endsWith('.') || match[2] !== undefined
        const listed = isPrefix ? WIZARD_KEYS.some(k => k.startsWith(key)) : WIZARD_KEYS.includes(key)
        if (!listed) {
          unlisted.push(`${path}: ${key}`)
        }
      }
    }
    expect(unlisted).toEqual([])
  })

  it.each(WIZARD_KEYS.filter(key => !MISSING_ON_DEPLOY.has(key)))('%s exists in the lite fixture', key => {
    expect(hasKey(key)).toBe(true)
  })

  it.each([...MISSING_ON_DEPLOY])('%s is listed as missing on deploy and is really absent', key => {
    expect(WIZARD_KEYS).toContain(key)
    expect(hasKey(key)).toBe(false)
  })
})
