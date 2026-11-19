import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { isAxiosError } from 'axios'
import { api } from '@/shared/api/client'

// PanelAlpha Go's catalog for the onboarding's PanelAlpha Go source. Go answers what a Git deploy needs; the panel deploys
// the app's repository as a Git project. The panel reads Go with a Hub token on the server
// (`/api/free/go`, package `edition-free`); the browser never sees the token. The app fields are Go's catalog API.

/** One app of Go's catalog list. */
export interface GoApp {
  slug: string
  name: string
  tagline?: string | null
  categories?: string[]
  repository?: string | null
  /** Its page on Go, where anyone can try it live. */
  page_url?: string | null
  icon_url?: string | null
  cover_url?: string | null
  /** The day Go last deployed it cleanly, `YYYY-MM-DD`. */
  verified?: string | null
  tried_30_days?: number | null
  ready_image?: boolean
  /** The repository's stars on its git host (GitHub, GitLab), as Go last read them; null when Go has no count. */
  stars?: number | null
  /** When Go last read `stars` (ISO 8601). */
  stars_updated_at?: string | null
  /** The products it replaces ("Notion"); can be empty. */
  replaces?: string[]
}

/** What Go's previews deploy: a `dind` project from the repository, with the limits Go verified the app with. */
export interface GoInstall {
  source: string
  git_repo: string
  /** `null`: the repository's default branch. */
  git_branch: string | null
  template?: string
  memory_mb?: number | null
  disk_mb?: number | null
}

/** `GET /community/go/categories`: the sidebar of the catalog. */
export async function getGoCategories (): Promise<GoCategory[]> {
  const { data } = await api.get<{ data: GoCategory[] }>('/community/go/categories')
  return data.data
}

/** `GET /community/go/apps/{slug}`: the app with its details and how to install it. */
export interface GoAppDetails extends GoApp {
  headline?: string | null
  description?: string | null
  highlights?: Array<{ title: string, text: string }>
  screenshots?: string[]
  install?: GoInstall | null
}

/** `GET /community/go/categories`: a category of the published apps and how many apps it has, the largest first. */
export interface GoCategory {
  name: string
  apps: number
}

/**
 * The orders of `/community/go/apps` (`sort=`): most tried in the last 30 days, A to Z, most recently verified, most stars (unknown last).
 * Apps that tie keep the site's order.
 */
export const GO_SORTS = ['tried', 'name', 'verified', 'stars'] as const
export type GoSort = (typeof GO_SORTS)[number]

/** The sort menu of the catalog (labels `form.option.sort.go*`), "Most tried" first. */
export const GO_SORT_KEYS: LegacySortHeader[] = [
  { text: 'sort.goTried', value: 'tried', sortable: true },
  { text: 'sort.goName', value: 'name', sortable: true },
  { text: 'sort.goVerified', value: 'verified', sortable: true },
  { text: 'sort.goStars', value: 'stars', sortable: true },
]

export interface GoAppsPage {
  data: GoApp[]
  meta: { current_page?: number, last_page?: number, per_page?: number, total?: number }
}

/** `GET /community/go`: whether the panel is paired with the Hub and Go answers. */
export interface GoStatus {
  connected: boolean
  available: boolean
  plan?: string | null
  entitlements?: { catalog?: boolean, ready_images?: boolean } | null
}

/** Why a catalog call failed: the panel is not paired with the Hub, or Go (or the Hub) is down. */
export type GoFailure = 'hub_not_connected' | 'go_unavailable'

export const GO_APPS_PER_PAGE = 24

/** The search box asks Go from this many characters on. */
export const GO_SEARCH_MIN_LENGTH = 2

export async function getGoStatus (): Promise<GoStatus> {
  const { data } = await api.get<GoStatus>('/community/go')
  return data
}

/** `GET /community/go/apps`: one page, ranked like the search when `q` is given, of one category when `category` is given, in `sort` order. */
export async function getGoApps (query: { q?: string, category?: string | null, sort?: GoSort | null, page?: number }): Promise<GoAppsPage> {
  const params: Record<string, string | number> = { page: query.page ?? 1, per_page: GO_APPS_PER_PAGE }
  if (query.q) {
    params.q = query.q
  }
  if (query.category) {
    params.category = query.category
  }
  if (query.sort) {
    params.sort = query.sort
  }
  const { data } = await api.get<GoAppsPage>('/community/go/apps', { params })
  return data
}

/** `GET /community/go/apps/{slug}`: read at install time, so the recipe is never an old one. */
export async function getGoApp (slug: string): Promise<GoAppDetails> {
  const { data } = await api.get<{ data: GoAppDetails }>(`/community/go/apps/${encodeURIComponent(slug)}`)
  return data.data
}

/** The reason of a failed catalog call; anything but "not paired" counts as the catalog being unavailable. */
export function goFailure (error: unknown): GoFailure {
  if (isAxiosError(error) && error.response?.status === 409) {
    return 'hub_not_connected'
  }
  return 'go_unavailable'
}

/**
 * What a card says the app replaces: the product the search found in it (`match`), else the first two. Null when it replaces nothing.
 * `query` is the search the list was asked with.
 */
export function replacesLine (app: Pick<GoApp, 'replaces'>, query: string): { names: string, match: boolean } | null {
  const replaces = (app.replaces ?? []).filter(name => typeof name === 'string' && name.trim() !== '')
  if (replaces.length === 0) {
    return null
  }
  const needle = query.trim().toLowerCase()
  const hit = needle === '' ? undefined : replaces.find(name => name.toLowerCase().includes(needle))
  return hit ? { names: hit, match: true } : { names: replaces.slice(0, 2).join(', '), match: false }
}

/** A star count the way Go's site shows it: 950, 1.2k, 41k, 1.5M. Null when there is no count. */
export function starsLabel (stars: number | null | undefined): string | null {
  if (typeof stars !== 'number' || !Number.isFinite(stars) || stars < 0) {
    return null
  }
  const short = (value: number) => value.toFixed(1).replace(/\.0$/, '')
  if (stars >= 1_000_000) {
    return `${short(stars / 1_000_000)}M`
  }
  if (stars >= 10_000) {
    return `${Math.round(stars / 1000)}k`
  }
  if (stars >= 1000) {
    return `${short(stars / 1000)}k`
  }
  return String(Math.round(stars))
}

/**
 * The tooltip of a star count: the count on the repository's git host and the day Go last read it ("41,250 stars on GitHub, as of
 * 2026-11-17"). `t` is the caller's translation function.
 */
export function starsTitle (app: Pick<GoApp, 'stars' | 'stars_updated_at' | 'repository'>, t: (key: string, options?: Record<string, unknown>) => string): string | undefined {
  if (typeof app.stars !== 'number') {
    return undefined
  }
  const count = app.stars.toLocaleString('en-US')
  const host = /^https?:\/\/(?:www\.)?github\.com\//i.test(app.repository ?? '') ? 'GitHub' : null
  const base = host
    ? t('heading.onboarding.goCatalog.starsOnHost', { count, host })
    : t('heading.onboarding.goCatalog.stars', { count })
  const day = app.stars_updated_at?.slice(0, 10)
  return day ? t('heading.onboarding.goCatalog.starsAsOf', { stars: base, date: day }) : base
}
