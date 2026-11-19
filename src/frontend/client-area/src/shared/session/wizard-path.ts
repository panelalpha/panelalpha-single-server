/** Root of the first-run setup wizard; the router guard (`app/router/setup-guard.ts`) and the wizard screens share it. */
export const WIZARD_PATH = '/wizard'

/**
 * `sessionStorage` mark of a wizard flow this browser started. The account step and the Hub round trip load a new page while the account
 * already exists (`/home` then says the setup is done), so the guard keeps the remaining steps open for that tab and for no other.
 */
export const WIZARD_FLOW_KEY = 'panelalpha.wizard-flow'

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>

/** A browser that refuses storage (private mode, some embeds) keeps the setup-required rule alone. */
function browserStorage (): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function isWizardFlowInProgress (storage: ReadStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(WIZARD_FLOW_KEY) === '1'
  } catch {
    return false
  }
}

export function markWizardFlowInProgress (storage: WriteStorage | null = browserStorage()): void {
  try {
    storage?.setItem(WIZARD_FLOW_KEY, '1')
  } catch {
    // No storage: the wizard still follows the setup-required rule, only the reload of a finished step loses its way back.
  }
}

export function clearWizardFlow (storage: WriteStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(WIZARD_FLOW_KEY)
  } catch {
    // No storage: nothing was marked.
  }
}
