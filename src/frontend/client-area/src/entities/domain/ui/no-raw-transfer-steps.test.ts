// Contract test: the content of the domain transfer step is `TransferDomainSteps`. Three modals
// (onboarding, hosting Domains, step 2 of Set domain) had their own copy of the step list; a new copy would bring it back.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const PATTERN = join(SRC, 'entities', 'domain', 'ui', 'TransferDomainSteps.vue')
const CONSUMERS = [
  'views/onboarding/modals/OnboardingDomainTransferModal.vue',
  'views/hosting/domains/TransferDomainModal.vue',
  'views/projects/project/topbar/SetYourDomainModal.vue',
].map(file => join(SRC, file))
const COPY = /transferDomain\.message\.(?:possible\.|impossible)/

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('transfer domain steps contract', () => {
  it('each transfer modal renders the pattern', () => {
    for (const file of CONSUMERS) {
      expect({ file: relative(ROOT, file), rendersPattern: readFileSync(file, 'utf8').includes('<TransferDomainSteps') })
        .toEqual({ file: relative(ROOT, file), rendersPattern: true })
    }
  })

  it('no other component copies the step list', () => {
    const offenders = walk(SRC)
      .filter(file => file !== PATTERN)
      .filter(file => COPY.test(readFileSync(file, 'utf8')))
      .map(file => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('knows a copy it must catch', () => {
    expect(COPY.test('t(\'heading.onboarding.transferDomain.message.possible.step1\')')).toBe(true)
    expect(COPY.test('t(\'heading.onboarding.transferDomain.message.impossible\')')).toBe(true)
    expect(COPY.test('t(\'heading.onboarding.transferDomain.message.verificationRequired\')')).toBe(false)
  })
})
