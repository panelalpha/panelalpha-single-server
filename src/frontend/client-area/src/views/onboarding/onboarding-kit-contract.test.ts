// Contract test: the onboarding steps use the kit. The step dialog is `OnboardingDialog` (or `AppDialog`),
// the card is `OnboardingCard`, the footer `OnboardingStepFooter`, the option cards `ChoiceCardGrid`, the progress card `ProgressScreen`,
// and the body lock lives in `OnboardingDialog`. A step that writes them by hand would bring the copies back.
// The rule for raw dialogs in the whole tree comes with the last change of the dialog family.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING = import.meta.dirname
const SRC = join(ONBOARDING, '..', '..')
const ROOT = join(SRC, '..')

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

function withoutComments (text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
}

const files = walk(ONBOARDING)
const allFiles = walk(SRC)

function offenders (pattern: RegExp, owners: string[], scope = files): string[] {
  return scope
    .filter(file => !owners.includes(relative(ROOT, file)))
    .filter(file => pattern.test(withoutComments(readFileSync(file, 'utf8'))))
    .map(file => relative(ROOT, file))
}

describe('onboarding kit contract (kit-dialog-onboarding)', () => {
  it('scans the onboarding views', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('has no raw dialog', () => {
    expect(offenders(/<v-dialog\b|<VDialog\b/, [])).toEqual([])
  })

  it('draws the step footer only in OnboardingStepFooter', () => {
    expect(offenders(/<StepIndicator\b/, ['src/views/onboarding/ui/OnboardingStepFooter.vue'])).toEqual([])
  })

  it('draws the option grid only in ChoiceCardGrid', () => {
    expect(offenders(/class="selection-box"/, ['src/views/onboarding/ui/ChoiceCardGrid.vue'])).toEqual([])
  })

  it('draws the progress card only in ProgressScreen', () => {
    expect(offenders(/class="installation-card[ "]/, ['src/views/onboarding/ui/ProgressScreen.vue'])).toEqual([])
  })

  it('holds the body lock only in OnboardingDialog', () => {
    expect(offenders(/useBodyScrollLock\(/, ['src/views/onboarding/ui/OnboardingDialog.vue'])).toEqual([])
  })

  it('puts the X above the card only in OnboardingCard (the onboarding process screen keeps its own)', () => {
    expect(offenders(/class="close-model"/, [
      'src/shared/ui/modal/OnboardingCard.vue',
      'src/views/onboarding/modals/OnboardingChooseOnboardingProcessModal.vue',
    ], allFiles)).toEqual([])
  })

  it('writes the onboarding card class only in OnboardingCard (the ssh closing window keeps its card)', () => {
    expect(offenders(/class="onboarding-modal[ "]/, [
      'src/shared/ui/modal/OnboardingCard.vue',
      'src/views/onboarding/OnboardingModals.vue',
    ], allFiles)).toEqual([])
  })
})
