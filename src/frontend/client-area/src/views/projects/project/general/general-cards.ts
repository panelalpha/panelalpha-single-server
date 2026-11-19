import type { InstanceResource } from '@/entities/project/instance-resource'

// The gates of the General cards: Site details and Loading speed show on
// `page_speed_enabled` or under single server; Installation only for WordPress (`hasInstallationDetails`). The order is the legacy
// order of the `v-row` children; the Security card is added by `withSecurityCard`.

export type GeneralCardKey = 'siteDetails' | 'installation' | 'gitSource' | 'filesSource' | 'security' | 'loadingSpeed'

/** The `/home` fields the gates read (`session.home`). */
export interface GeneralHome {
  app?: {
    page_speed_enabled?: boolean
    single_server?: { active?: boolean } | null
  } | null
}

/** Skeleton slots shown while the instance is fetching (legacy: Installation, Site details, Security, Loading speed). */
export const GENERAL_SKELETON_VARIANTS = ['installation', 'siteDetails', 'security', 'loadingSpeed'] as const

export const GENERAL_SKELETON_CARD_COUNT = GENERAL_SKELETON_VARIANTS.length

/** `page_speed_enabled` or single server. */
export function speedCardsEnabled (home: GeneralHome | null | undefined): boolean {
  return home?.app?.page_speed_enabled === true || home?.app?.single_server?.active === true
}

/** The cards of the General grid for a loaded instance, in legacy order. */
export function visibleGeneralCards (
  instance: Pick<InstanceResource, 'hasInstallationDetails' | 'hasGitSource' | 'hasFilesSource'>,
  home: GeneralHome | null | undefined,
): GeneralCardKey[] {
  const cards: GeneralCardKey[] = []
  if (speedCardsEnabled(home)) {
    cards.push('siteDetails')
  }
  if (instance.hasInstallationDetails()) {
    cards.push('installation')
  } else if (instance.hasGitSource()) {
    // The source cards are `v-else-if` of Installation.
    cards.push('gitSource')
  } else if (instance.hasFilesSource()) {
    cards.push('filesSource')
  }
  if (speedCardsEnabled(home)) {
    cards.push('loadingSpeed')
  }
  return cards
}

/**
 * The Security card is always shown and sits before Loading speed (after Installation and the
 * other source cards). With the speed cards hidden it goes last.
 */
export function withSecurityCard (cards: GeneralCardKey[]): GeneralCardKey[] {
  const at = cards.indexOf('loadingSpeed')
  if (at === -1) {
    return [...cards, 'security']
  }
  return [...cards.slice(0, at), 'security', ...cards.slice(at)]
}
