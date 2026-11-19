import type { HomeResponse } from './session.api'

/**
 * Base SPA path after sign-in: app-lite single-server mode lands on `/projects`,
 * app (multi-server, no `single_server`) on `/instances`. Legacy uses `!!`.
 */
export function preferredSpaBase (
  home: Pick<HomeResponse, 'app'> | null | undefined,
): '/projects' | '/instances' {
  return home?.app?.single_server?.active ? '/projects' : '/instances'
}

/**
 * i18n keys of the list `/` leads to, for the two links that lead there without a text of their own: the top bar's logo
 * (`name`, the screen's own key, the same one its navbar tab shows) and a project page's back arrow (`back`).
 */
export function preferredSpaBaseLabels (
  home: Pick<HomeResponse, 'app'> | null | undefined,
): { name: string, back: string } {
  return preferredSpaBase(home) === '/projects'
    ? { name: 'heading.navbar.tab.myProjects', back: 'button.projects.back' }
    : { name: 'heading.navbar.tab.myInstances', back: 'button.instances.back' }
}
