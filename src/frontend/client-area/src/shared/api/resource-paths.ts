import type { HomeResponse } from '@/shared/session/session.api'
import { getActivePinia } from 'pinia'

/**
 * Instances <-> Projects path helpers of app-lite: single server prefers "projects" in API
 * and SPA paths, multi server "instances". The single-server flag is `session.home.app.single_server.active`.
 */

/**
 * Whether single server is active; false while Pinia or `/home` is not there yet (early boot, unit tests). It reads the state of the
 * `session` store from Pinia instead of importing the store: the store imports the API client, which imports this module.
 */
export function isSingleServerActive (): boolean {
  try {
    const home = (getActivePinia()?.state.value.session as { home?: HomeResponse | null } | undefined)?.home
    return Boolean(home?.app?.single_server?.active)
  } catch {
    return false
  }
}

/**
 * The `instances` / `projects` segment of a request path becomes the preferred one.
 * `/instances/1/git` -> `/projects/1/git` (single server), `instances?page=1` -> `projects?page=1`.
 */
export function rewriteResourcePath (path: string, singleServer: boolean): string {
  if (!path || typeof path !== 'string') {
    return path
  }
  const segment = singleServer ? 'projects' : 'instances'
  return path.replace(/(^|\/)(instances|projects)(?=\/|\?|$)/g, `$1${segment}`)
}

/** A URL, an e-mail address, a host name or a path, which `rebrandCopy` keeps as written. */
const VERBATIM_SPAN = /[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]*|[\w.%+-]+@(?:[\w-]+\.)+[a-z]{2,}|(?:[\w-]+\.)+[a-z]{2,}|\/[\w.~%/@:=+-]*/gi

/** English Instance(s) -> Project(s), without the edition check. Unlike legacy, the article follows, "an instance" -> "a project". */
export function rebrandCopy (text: string): string {
  let result = ''
  let end = 0
  for (const span of text.matchAll(VERBATIM_SPAN)) {
    const start = span.index
    result += `${rebrandWords(text.slice(end, start))}${span[0]}`
    end = start + span[0].length
  }
  return result + rebrandWords(text.slice(end))
}

function rebrandWords (text: string): string {
  return text
    .replace(/\ban (Instances?|instances?)\b/g, (_m, noun: string) => `a ${noun.replace(/nstance/, 'roject').replace(/^I/, 'P').replace(/^i/, 'p')}`)
    .replace(/\bAn (Instances?|instances?)\b/g, (_m, noun: string) => `A ${noun.replace(/nstance/, 'roject').replace(/^I/, 'P').replace(/^i/, 'p')}`)
    .replace(/\bInstances\b/g, 'Projects')
    .replace(/\bInstance\b/g, 'Project')
    .replace(/\binstances\b/g, 'projects')
    .replace(/\binstance\b/g, 'project')
}

/** Only under single server; other values pass through. */
export function rebrandResourceCopy<T> (text: T): T {
  if (typeof text !== 'string' || !isSingleServerActive()) {
    return text
  }
  return rebrandCopy(text) as T
}

/** `/projects/<rest>` under single server, `/instances/<rest>` otherwise. */
export function spaResourcePath (rest: string | number, singleServer: boolean): string {
  const segment = singleServer ? 'projects' : 'instances'
  const normalized = String(rest ?? '').replace(/^\/+/, '')
  return normalized ? `/${segment}/${normalized}` : `/${segment}`
}
