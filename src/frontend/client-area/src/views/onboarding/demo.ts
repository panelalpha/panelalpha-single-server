import { DEMO_EMAIL } from '@/shared/session/demo-mode'

/** The demo result comes this long after the progress opens. */
export const DEMO_INSTALL_DELAY_MS = 3000

/** The demo account walks the flow without the API. */
export function isDemoAccount (email: string | null | undefined): boolean {
  return email === DEMO_EMAIL
}

/** The key that starts the demo flow when the shell loads. */
export function autostartKey (origin: string): string {
  return `${origin}-autostartInstallation`
}

/**
 * The demo account with the autostart key set. Any truthy stored value counts, as in legacy.
 * Blocked storage reads as no autostart.
 */
export function isAutostartEnabled (
  email: string | null | undefined,
  origin: string,
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  if (!isDemoAccount(email)) {
    return false
  }
  try {
    return Boolean((storage ?? window.localStorage).getItem(autostartKey(origin)))
  } catch {
    return false
  }
}

/** The key goes once the user picked the process. Blocked storage has nothing to remove. */
export function clearAutostart (origin: string, storage?: Pick<Storage, 'removeItem'>): void {
  try {
    (storage ?? window.localStorage).removeItem(autostartKey(origin))
  } catch {
    // Blocked storage: the key was never stored.
  }
}

/** The effects of the demo installation, bound to the store; `inRun` is the run the demo started in. */
export interface DemoInstallDeps {
  /** The standard progress opens. */
  showProgress: () => void
  /** The result is completed, followed by the success alert. */
  complete: (successMessage: string) => void
  /** True while the flow that started the demo is still open (legacy has no guard; the timer must not reopen a closed flow). */
  inRun: () => boolean
}

/** The copy stays English, as in legacy. */
export function demoSuccessMessage (name: string | null | undefined): string {
  return `Instance "${name}" installed successfully`
}

/**
 * The progress opens at once, no request runs, and after the delay the result is completed with
 * a success alert. The run guard drops the result when the flow was closed or started again during the delay (no alert).
 */
export function scheduleDemoInstallation (
  deps: DemoInstallDeps,
  name: string | null | undefined,
  delayMs: number = DEMO_INSTALL_DELAY_MS,
): void {
  const successMessage = demoSuccessMessage(name)
  deps.showProgress()
  setTimeout(() => {
    if (!deps.inRun()) {
      return
    }
    deps.complete(successMessage)
  }, delayMs)
}
