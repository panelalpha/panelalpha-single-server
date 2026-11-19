/**
 * The browser back button closes the onboarding. The legacy
 * `history.pushState({}, '', '')` wiped the vue-router state (`back`, `current`, `position`), so the copy keeps it.
 */
let handler: (() => void) | null = null

export function armBackButton (onBack: () => void): void {
  disarmBackButton()
  history.pushState({ ...history.state }, '')
  handler = onBack
  window.addEventListener('popstate', onBack)
}

export function disarmBackButton (): void {
  if (handler) {
    window.removeEventListener('popstate', handler)
    handler = null
  }
}
