import { getErrorMessages } from '@/shared/api/error-message'

// "Create your first project" on the last step (the admin area finishes with the SSO token of the admin; the Community panel has none): the session
// is read again, the browser goes to the list of projects, and only then the first step of the onboarding opens, as "Create" does on an empty
// list. The onboarding starts after the move, because it pushes a history entry of its own.

export interface FinishDeps {
  /** Drops the cached GET answers, so the new `/home` is not the one read before the setup. */
  clearCache: () => void
  /** Reads `/home` again. */
  ensureHome: () => Promise<unknown>
  /** Moves to the start page of the panel (`/projects` on single-server). `true` when the navigation ended there. */
  openStart: () => Promise<boolean>
  /** Forgets the wizard flow of this tab once the panel is open, so its steps are closed again. */
  clearFlow: () => void
  /** Reads the services again (`/home`), as the empty list does before the onboarding. */
  refreshServices: () => Promise<unknown>
  /** `start-installation-process` of the app events. */
  startOnboarding: () => void
}

/** Runs the finish. Returns the messages of the error that stopped it before the move, or an empty list. */
export async function finishWizard (deps: FinishDeps): Promise<string[]> {
  try {
    deps.clearCache()
    await deps.ensureHome()
    const arrived = await deps.openStart()
    deps.clearFlow()
    if (!arrived) {
      return []
    }
  } catch (error) {
    return getErrorMessages(error)
  }
  // The step is gone after the move: a failed read only leaves the onboarding closed, the user has "Create" on the list.
  try {
    await deps.refreshServices()
  } catch {
    return []
  }
  deps.startOnboarding()
  return []
}
