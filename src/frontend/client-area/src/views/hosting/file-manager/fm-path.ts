// Paths of the File Manager: relative to the disk root, no leading or trailing slash. '' is the home directory.

export const ROOT_PATH = ''

export interface FmPathSegment {
  name: string
  path: string
}

export type FmNameError = 'empty' | 'exists' | 'invalid'

export function normalizePath (path: string): string {
  return path.split('/').filter(segment => segment !== '').join('/')
}

export function joinPath (parent: string, name: string): string {
  return normalizePath(parent ? `${parent}/${name}` : name)
}

export function parentPath (path: string): string {
  const segments = normalizePath(path).split('/').filter(Boolean)
  return segments.slice(0, -1).join('/')
}

export function baseName (path: string): string {
  const segments = normalizePath(path).split('/').filter(Boolean)
  return segments.at(-1) ?? ''
}

/** Breadcrumb segments without the root: `a/b` gives `a` and `a/b`. */
export function pathSegments (path: string): FmPathSegment[] {
  const segments: FmPathSegment[] = []
  let current = ''
  for (const name of normalizePath(path).split('/').filter(Boolean)) {
    current = current ? `${current}/${name}` : name
    segments.push({ name, path: current })
  }
  return segments
}

/** One path segment: no `/`, `\` or NUL, as the backend refuses; an upload part cannot carry a backslash. */
export function isInvalidItemName (name: string): boolean {
  return name.includes('/') || name.includes('\\') || name.includes('\0')
}

/**
 * Name of a new or renamed item. Legacy rule: an empty name is not allowed and a name that matches a basename
 * in the current folder is taken (basenames are compared).
 */
export function validateItemName (name: string, takenBasenames: readonly string[]): FmNameError | null {
  if (name === '') {
    return 'empty'
  }
  if (isInvalidItemName(name)) {
    return 'invalid'
  }
  return takenBasenames.includes(name) ? 'exists' : null
}
