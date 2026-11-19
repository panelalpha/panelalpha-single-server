// Contract test: the session screens use `AuthCard`, the support sentence is `SupportLink` and the
// 2FA recovery code is `RecoveryCodeBox`. A raw card, bottom box, support sentence or recovery box would bring the copies back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const OWNER_DIR = join(SRC, 'shared', 'ui', 'auth-frame')

// The session screens: no raw `v-card` at all (their cards are `AuthCard`).
const SESSION_SCREENS = [
  'views/auth/LoginView.vue',
  'views/auth/RegisterView.vue',
  'views/auth/ForgotPasswordView.vue',
  'views/auth/ResetPasswordView.vue',
  'views/auth/AcceptInviteView.vue',
  'views/auth/VerifyEmail.vue',
  'views/auth/HubLoginView.vue',
]

// `.recovery-code-box` with another look (padding, background `--v-deploy-accent`).
const RECOVERY_EXEMPT = new Set(['views/projects/project/topbar/ReportProviderTrackingCodeModal.vue'])

const RAW_CARD = /<v-card(?=[\s>/]|$)|<VCard(?=[\s>/]|$)/m
const RAW_BOTTOM = /class=["'][^"']*\blogin-bottom-box\b/
const RAW_SUPPORT = /message\.support\.before/
const RAW_RECOVERY = /class=["'][^"']*\brecovery-code-box\b/
const STYLE_IMPORT = /auth-frame\/auth-screen\.scss/

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

const files = walk(SRC).filter(file => !file.startsWith(OWNER_DIR + '/'))

describe('auth card contract', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  it('the session screens have no raw v-card', () => {
    for (const key of SESSION_SCREENS) {
      const template = templateOf(readFileSync(join(SRC, key), 'utf8'))
      expect({ key, raw: RAW_CARD.test(template) }).toEqual({ key, raw: false })
      expect({ key, pattern: /<AuthCard\b/.test(template) }).toEqual({ key, pattern: true })
    }
  })

  it('no file outside the kit writes the bottom box, the support sentence or the recovery box by hand', () => {
    const offenders = files.filter(file => {
      const template = templateOf(readFileSync(file, 'utf8'))
      const key = relative(SRC, file)
      return RAW_BOTTOM.test(template)
        || RAW_SUPPORT.test(template)
        || (RAW_RECOVERY.test(template) && !RECOVERY_EXEMPT.has(key))
    })
    expect(offenders.map(file => relative(ROOT, file))).toEqual([])
  })

  it('only AuthCard imports the session card stylesheet', () => {
    const importers = walk(SRC).filter(file => STYLE_IMPORT.test(readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '')))
    expect(importers.map(file => relative(SRC, file))).toEqual(['shared/ui/auth-frame/AuthCard.vue'])
  })

  it('knows the raw spellings it must catch', () => {
    expect(RAW_CARD.test('<v-card\n  class="d-flex"')).toBe(true)
    expect(RAW_CARD.test('<v-card-title>')).toBe(false)
    expect(RAW_BOTTOM.test('<div class="login-bottom-box p-d">')).toBe(true)
    expect(RAW_SUPPORT.test('{{ t(\'message.support.before\') }}')).toBe(true)
    expect(RAW_RECOVERY.test('<div class="recovery-code-box">')).toBe(true)
  })
})
