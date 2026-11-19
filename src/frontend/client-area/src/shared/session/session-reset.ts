// Sign-out hook for module-level caches of the signed-in user's data. `shared/` must not know the entities that keep such caches
// (shared -> nothing above), so an entity module registers its reset here and `clearSession()` runs them all.
// A module that was never loaded has no cache to forget, so a late registration loses nothing.

const handlers = new Set<() => void>()

/** Registers `handler` to run on every sign-out and 401 (`clearSession`). Registering the same function twice keeps one entry. */
export function onSessionCleared (handler: () => void): void {
  handlers.add(handler)
}

/** Runs every registered handler; called by `clearSession()` only. */
export function runSessionClearedHandlers (): void {
  for (const handler of handlers) {
    handler()
  }
}
