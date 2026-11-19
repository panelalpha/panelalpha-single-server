import { api } from '@/shared/api/client'

// A light list of projects for a select (name and id only). It reads the heavy `GET /instances` (the client rewrites it to `/projects` on
// single-server) and skips `toInstanceResource`: a page holds at most 100 rows and the meta has no `last_page`, so the next pages are
// fetched by `meta.total`.

export interface ProjectOption {
  id: number
  name: string
}

interface RawProjectOption {
  id: number
  name?: string | null
  staging_apps?: RawProjectOption[] | null
}

interface ProjectOptionsResponse {
  data?: RawProjectOption[]
  meta?: { total?: number }
}

const PER_PAGE = 100
// Guard against a backend that keeps answering with rows while `meta.total` is never reached.
const MAX_PAGES = 50

/**
 * Projects (and their staging apps, flattened) sorted by name, without an alert on failure: a failed first page gives an empty list, a
 * failed later page keeps the projects of the pages read before it.
 */
export async function listProjectOptions (): Promise<ProjectOption[]> {
  const options = new Map<number, ProjectOption>()
  let fetched = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data: ProjectOptionsResponse
    try {
      data = (await api.get<ProjectOptionsResponse>('/instances', { params: { page, per_page: PER_PAGE } })).data
    } catch {
      break
    }
    const rows = data.data ?? []
    for (const row of rows) {
      for (const item of [row, ...(row.staging_apps ?? [])]) {
        options.set(item.id, { id: item.id, name: item.name ?? '' })
      }
    }
    fetched += rows.length
    if (rows.length === 0 || fetched >= (data.meta?.total ?? 0)) {
      break
    }
  }
  // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` is not in the app tsconfig lib (es2022); the spread is already a copy
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name))
}
