/**
 * Whether the tab is in the background. Pollers skip their tick then (the pattern of `use-free-tasks.ts`):
 * nobody sees the data, and the next visible tick fetches it again.
 */
export function isPageHidden (): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}
