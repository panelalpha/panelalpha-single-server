// Contract test: the session password and email fields are `PasswordField` / `EmailField`, a label above a
// settings, account, services or reseller control is `LabeledField`, and a settings select is `SettingsSelect`. A new raw field, label or
// select in these screens would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')

// Raw `v-text-field` left in the template: Login keeps the 2FA code field (`auth-field-code`).
const SESSION: Record<string, number> = {
  'views/auth/LoginView.vue': 1,
  'views/auth/RegisterView.vue': 0,
  'views/auth/ResetPasswordView.vue': 0,
  'views/auth/AcceptInviteView.vue': 0,
  'views/auth/ForgotPasswordView.vue': 0,
}

// Other screens in `src/views/auth` with a raw `v-text-field`, and why: the code digit cells are not a password or email field.
const AUTH_RAW_EXEMPT: Record<string, number> = {
  'views/auth/VerifyEmail.vue': 1,
}

// Raw `<label>` left in the template: empty spacer labels above a button and the recovery checkbox label.
const LABELED: Record<string, number> = {
  'views/account/settings/SettingsView.vue': 0,
  'views/account/settings/backups/BackupSettings.vue': 0,
  'views/account/settings/backups/BackupStoreModal.vue': 0,
  'views/account/profile/MyAccountView.vue': 1,
  'views/account/profile/MyAccountModal.vue': 0,
  'views/account/profile/TwoFactorAuthModal.vue': 0,
  'views/account/services/CancelServiceButton.vue': 0,
  'views/reseller/email-settings/EmailSettingsView.vue': 0,
  'views/reseller/branding/BrandingView.vue': 0,
}

const SELECTS = [
  'views/account/settings/SettingsView.vue',
  'views/account/settings/backups/BackupSettings.vue',
  'views/account/settings/backups/BackupStoreModal.vue',
]

// Selects kept raw with a reason; empty, every settings select is `SettingsSelect`.
const SELECT_EXEMPT = new Set<string>()

const RAW_TEXT_FIELD = /<v-text-field\b|<VTextField\b/g
const RAW_LABEL = /<label(?=[\s>/]|$)/gm
const RAW_SELECT = /<v-select\b|<VSelect\b/g
const SESSION_ICON = /prepend-inner-icon="'?\$(?:lockoutline|email)'?"/
const PATTERN_FIELD = /<(?:PasswordField|EmailField|password-field|email-field)\b/
const PATTERN_LABEL = /<(?:LabeledField|labeled-field)\b/

// Every `.vue`, `.scss` and `.ts` file below `directory`.
function walkAll (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walkAll(path)
    }
    return /\.(?:vue|scss|ts)$/.test(entry.name) ? [path] : []
  })
}

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

function countIn (text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

describe('form fields contract', () => {
  it('session screens use PasswordField and EmailField', () => {
    for (const [key, rawFields] of Object.entries(SESSION)) {
      const template = templateOf(readFileSync(join(SRC, key), 'utf8'))
      expect({ key, raw: countIn(template, RAW_TEXT_FIELD) }).toEqual({ key, raw: rawFields })
      expect({ key, pattern: PATTERN_FIELD.test(template) }).toEqual({ key, pattern: true })
    }
  })

  it('every screen in src/views/auth is listed: a new raw field there is caught', () => {
    const expected = { ...SESSION, ...AUTH_RAW_EXEMPT }
    const files = walk(join(SRC, 'views', 'auth'))
    expect(files.length).toBeGreaterThan(Object.keys(SESSION).length)
    for (const file of files) {
      const key = relative(SRC, file)
      const raw = countIn(templateOf(readFileSync(file, 'utf8')), RAW_TEXT_FIELD)
      expect({ key, raw }).toEqual({ key, raw: expected[key] ?? 0 })
    }
  })

  it('no screen sets the session field icons by hand', () => {
    const files = [join(SRC, 'views'), join(SRC, 'entities')].flatMap(directory => walk(directory))
    const offenders = files.filter(file => SESSION_ICON.test(templateOf(readFileSync(file, 'utf8'))))
    expect(offenders.map(file => relative(ROOT, file))).toEqual([])
  })

  it('labels above controls use LabeledField', () => {
    for (const [key, rawLabels] of Object.entries(LABELED)) {
      const text = readFileSync(join(SRC, key), 'utf8')
      expect({ key, raw: countIn(templateOf(text), RAW_LABEL) }).toEqual({ key, raw: rawLabels })
      expect({ key, pattern: PATTERN_LABEL.test(templateOf(text)) }).toEqual({ key, pattern: true })
      expect({ key, spacer: text.includes('label + .v-input') }).toEqual({ key, spacer: false })
    }
  })

  it('no file positions a control under a label by hand (`label + .v-input`)', () => {
    const files = walkAll(SRC).filter(file => file !== import.meta.filename)
    expect(files.length).toBeGreaterThan(500)
    const offenders = files.filter(file => readFileSync(file, 'utf8').includes('label + .v-input'))
    expect(offenders.map(file => relative(ROOT, file))).toEqual([])
  })

  it('settings selects use SettingsSelect', () => {
    for (const key of SELECTS.filter(file => !SELECT_EXEMPT.has(file))) {
      const raw = countIn(templateOf(readFileSync(join(SRC, key), 'utf8')), RAW_SELECT)
      expect({ key, raw }).toEqual({ key, raw: 0 })
    }
  })

  it('knows the raw tags it must catch', () => {
    for (const sample of ['<label class="x">', '<label>', '<label\n']) {
      expect({ sample, caught: countIn(sample, RAW_LABEL) > 0 }).toEqual({ sample, caught: true })
    }
    expect(countIn('<labeled-field :label="x">', RAW_LABEL)).toBe(0)
    expect(SESSION_ICON.test('prepend-inner-icon="$lockoutline"')).toBe(true)
    expect(SESSION_ICON.test(`prepend-inner-icon="'$email'"`)).toBe(true)
    expect(countIn('<v-text-field v-model="x" />\n<VTextField />', RAW_TEXT_FIELD)).toBe(2)
    expect(countIn('<v-text-fields />', RAW_TEXT_FIELD)).toBe(0)
    expect(countIn('<v-select :items="x" />\n<VSelect />', RAW_SELECT)).toBe(2)
    expect(countIn('<settings-select />', RAW_SELECT)).toBe(0)
    expect(PATTERN_FIELD.test('<PasswordField v-model="x" />')).toBe(true)
    expect(PATTERN_FIELD.test('<email-field />')).toBe(true)
    expect(PATTERN_LABEL.test('<LabeledField label="x">')).toBe(true)
  })
})
