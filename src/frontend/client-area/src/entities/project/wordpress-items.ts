import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { compareVersions } from '@/shared/version/compare-versions'

// Logic shared by the WordPress plugins and themes lists (installed and catalogue entries). Each helper takes minimal shapes, so a feature
// passes its own types (`InstalledPlugin`, `RepositoryPlugin`, later the themes ones). Nothing here imports from `@/features`.

/** The async status the install and update requests write. */
export interface ItemAsyncStatus {
  install?: string | null
  update?: string | null
}

export type ItemAsyncState = 'installing' | 'updating' | null

const IN_PROGRESS = new Set(['pending', 'in_progress'])

/** Whether an install or an update is in progress. Install is checked first. Catalogue entries too. */
export function itemAsyncState (item: { async_status?: ItemAsyncStatus }): ItemAsyncState {
  if (IN_PROGRESS.has(item.async_status?.install ?? '')) {
    return 'installing'
  }
  if (IN_PROGRESS.has(item.async_status?.update ?? '')) {
    return 'updating'
  }
  return null
}

/**
 * Updates the item with the same `name` in the full list (the realtime status update). The payload is merged
 * over the item (legacy replaced it whole), so a partial payload keeps the fields it does not carry. Items are matched by name only:
 * dropping events of another instance (by `application_id`, when the body has it) is up to the subscriber.
 */
export function replaceByName<T extends { name: string }> (all: readonly T[], item: T): T[] {
  return all.map(entry => (entry.name === item.name ? { ...entry, ...item } : entry))
}

/** The catalogue entries whose slug is not an installed item name. */
export function visibleCatalogue<C extends { slug: string }> (all: readonly C[], installed: readonly { name: string }[]): C[] {
  // One set of installed names instead of a scan of the installed list per catalogue entry.
  const names = new Set(installed.map(entry => entry.name))
  return all.filter(item => !names.has(item.slug))
}

/**
 * The catalogue half of the status update: the first entry whose slug is the payload's `name` or `slug` takes
 * its `async_status` (the install spinner). Without a match the list is returned as it is.
 */
export function patchCatalogueStatus<C extends { slug: string, async_status?: ItemAsyncStatus }> (
  all: readonly C[],
  payload: { name?: unknown, slug?: unknown, async_status?: ItemAsyncStatus },
): readonly C[] {
  const index = all.findIndex(item => item.slug === payload.name || item.slug === payload.slug)
  if (index === -1) {
    return all
  }
  return all.map((item, key) => (key === index ? { ...item, async_status: payload.async_status } : item))
}

export interface CataloguePageOptions {
  sortBy: LegacySortHeader | false
  sortDesc: boolean
  page: number
  itemsPerPage: number
}

export interface CataloguePage<C> {
  items: C[]
  /** Length of the whole catalogue list before the installed items are filtered out. */
  itemsTotal: number
}

function valueOf<C> (item: C, key: string): unknown {
  return (item as unknown as Record<string, unknown>)[key]
}

// Legacy V2 sort: numbers compare numerically, anything else through `localeCompare`. A missing value goes last whatever the direction.
export function compareValues (a: unknown, b: unknown, sortDesc: boolean): number {
  if (a == null || b == null) {
    return (a == null ? 1 : 0) - (b == null ? 1 : 0)
  }
  const direction = sortDesc ? -1 : 1
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
    return (Number(a) - Number(b)) * direction
  }
  return String(a).localeCompare(String(b)) * direction
}

// Version column: numeric segments compare as numbers (`10.0` after `9.0`). A missing value goes last whatever the direction.
export function compareVersionValues (a: unknown, b: unknown, sortDesc: boolean): number {
  if (a == null || b == null) {
    return (a == null ? 1 : 0) - (b == null ? 1 : 0)
  }
  return compareVersions(String(a), String(b)) * (sortDesc ? -1 : 1)
}

/**
 * The catalogue load as the host runs it: drop the installed items, sort (an empty `sortBy` value means no
 * sort), then cut the page. `itemsTotal` is taken before the filter, as legacy did.
 */
export function pageCatalogue<C extends { slug: string }> (
  all: readonly C[],
  installed: readonly { name: string }[],
  options: CataloguePageOptions,
): CataloguePage<C> {
  const items = visibleCatalogue(all, installed)

  if (options.sortBy && options.sortBy.value !== '') {
    const key = options.sortBy.value
    items.sort((first, second) => (key === 'version'
      ? compareVersionValues(valueOf(first, key), valueOf(second, key), options.sortDesc)
      : compareValues(valueOf(first, key), valueOf(second, key), options.sortDesc)))
  }

  const start = (options.page - 1) * options.itemsPerPage
  return {
    items: items.slice(start, start + options.itemsPerPage),
    itemsTotal: all.length,
  }
}

/**
 * One star with `percent = rating / 100`. Legacy renders one star, not five, so this follows legacy.
 */
export function starPercent (rating: number): number {
  return Math.min(1, Math.max(0, rating / 100))
}

/** The rating out of five, shown next to the star. */
export function ratingLabel (rating: number): number {
  return Math.ceil((rating / 10) * 5) / 10
}

export const CARD_DESCRIPTION_LIMIT = 100

export interface CardDescription {
  /** Text for `v-html`; `undefined` renders nothing (legacy, when no space falls in the first 100 characters). */
  text: string | undefined
  hasReadMore: boolean
}

/**
 * A description of up to 100 characters is shown whole. A longer one is cut at the
 * last space before the 100th character and gets the "Read More" link. A missing description reads as empty instead of throwing.
 */
export function cardDescription (description: string | null = ''): CardDescription {
  const text = description ?? ''
  if (text.length <= CARD_DESCRIPTION_LIMIT) {
    return { text, hasReadMore: false }
  }
  const lastSpace = text.lastIndexOf(' ', CARD_DESCRIPTION_LIMIT - 1)
  if (lastSpace === -1) {
    return { text: undefined, hasReadMore: true }
  }
  return { text: `${text.slice(0, lastSpace)} `, hasReadMore: true }
}
