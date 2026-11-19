export type AdvancedResourceBase = '/instances' | '/projects'

/**
 * `/projects` only under the `/projects` route.
 * Own module: the sidebar items and the hosting sections both need it, and as part of the sidebar items it made them
 * import each other.
 */
export function resourceBaseFor (path: string): AdvancedResourceBase {
  return path.startsWith('/projects') ? '/projects' : '/instances'
}
