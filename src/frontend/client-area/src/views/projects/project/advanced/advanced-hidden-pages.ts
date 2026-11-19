// Advanced pages hidden on purpose, keyed by the
// last path segment of the route (route meta `title` is `users` for both `users` and `wordpress-users`).
export const ADVANCED_HIDDEN_PAGES: readonly string[] = ['copy-instance', 'users']

export function isAdvancedPageHidden (segment: string): boolean {
  return ADVANCED_HIDDEN_PAGES.includes(segment)
}

/** The hidden page named by an Advanced route path, or `null` (a trailing slash is allowed, deeper paths are not). */
export function hiddenAdvancedPageOf (path: string | undefined): string | null {
  const match = /^\/(?:projects|instances)\/[^/]+\/advanced\/([^/]+)\/?$/.exec(path ?? '')
  return match && isAdvancedPageHidden(match[1]!) ? match[1]! : null
}
