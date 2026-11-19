import { WIZARD_PATH } from '@/shared/session/wizard-path'

// Steps of the wizard (single-server without beta mode). The step lives in the URL
// (`/wizard/<slug>`), so a link opens it; `/wizard` itself is the start page, before the first step.

export type WizardStepSlug = 'panelalpha-connect' | 'general-config' | 'connect-ai' | 'summary'

export interface WizardStep {
  slug: WizardStepSlug
  /** Key of the name in the sidebar; the English text is the fallback while the backend has no key (`setup.wizard.*`). */
  labelKey: string
  defaultLabel: string
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { slug: 'panelalpha-connect', labelKey: 'setup.wizard.steps.signIn', defaultLabel: 'Sign in' },
  { slug: 'general-config', labelKey: 'setup.wizard.steps.serverName', defaultLabel: 'Server name' },
  { slug: 'connect-ai', labelKey: 'setup.wizard.steps.connectAi', defaultLabel: 'Connect AI' },
  { slug: 'summary', labelKey: 'setup.wizard.steps.done', defaultLabel: 'Done' },
]

/** Index of the step a path shows, or -1 for the start page and for any path outside the steps. */
export function stepFromPath (path: string): number {
  const prefix = `${WIZARD_PATH}/`
  if (!path.startsWith(prefix)) {
    return -1
  }
  const slug = path.slice(prefix.length).replace(/\/$/, '')
  return WIZARD_STEPS.findIndex(step => step.slug === slug)
}

/** Index of a step in the list, so the components do not know the numbers. */
export function stepIndex (slug: WizardStepSlug): number {
  return WIZARD_STEPS.findIndex(step => step.slug === slug)
}

/** Number of a step as shown in the circle (from 1). */
export function stepNumber (slug: WizardStepSlug): number {
  return stepIndex(slug) + 1
}

/** Path of a step; an index outside the list leads to the start page. */
export function pathOfStep (index: number): string {
  const step = WIZARD_STEPS[index]
  return step === undefined ? WIZARD_PATH : `${WIZARD_PATH}/${step.slug}`
}

/** Path of a step by its slug, so the components do not know the order (Hub comes first). */
export function pathOfSlug (slug: WizardStepSlug): string {
  return `${WIZARD_PATH}/${slug}`
}

/** Path of the step after `slug`; the last step leads to the start page. */
export function nextPath (slug: WizardStepSlug): string {
  const index = WIZARD_STEPS.findIndex(step => step.slug === slug)
  return pathOfStep(index + 1)
}

/** Path of the step before `slug`; the first step leads to the start page. */
export function previousPath (slug: WizardStepSlug): string {
  const index = WIZARD_STEPS.findIndex(step => step.slug === slug)
  return index <= 0 ? WIZARD_PATH : pathOfStep(index - 1)
}

export interface StepAccess {
  /** The setup is over (the account exists): step 1 is closed for good, Hub is connected later in Settings. */
  setupDone?: boolean
}

/** Step 1 (Hub) cannot be opened once the setup is done; every other step follows `maxStep`. */
export function isStepClosedBySetup (index: number, access: StepAccess = {}): boolean {
  return index === 0 && access.setupDone === true
}

/**
 * The setup is over once the account exists: a signed-in user, or a panel that no longer asks for the setup (a stale `/home` still saying
 * `setup_required` for a signed-in user counts as done, like in step 2). Step 1 is closed from then on.
 */
export function isSetupDone (hasUser: boolean, setupRequired: boolean | undefined): boolean {
  return hasUser || setupRequired === false
}

/** A step is open when it is not beyond the furthest one reached and the setup has not closed it. */
export function canOpenStep (index: number, maxStep: number, access: StepAccess = {}): boolean {
  return index >= 0 && index < WIZARD_STEPS.length && index <= maxStep && !isStepClosedBySetup(index, access)
}

/** `maxStep` only grows: going back to an earlier step keeps the progress. */
export function nextMaxStep (maxStep: number, index: number): number {
  return Math.max(index, maxStep)
}

export type WizardStepState = 'completed' | 'current' | 'future'

/** Look of a step in the sidebar: completed before `maxStep`, current at `maxStep`. */
export function stepState (index: number, maxStep: number): WizardStepState {
  if (index < maxStep) {
    return 'completed'
  }
  return index === maxStep ? 'current' : 'future'
}
