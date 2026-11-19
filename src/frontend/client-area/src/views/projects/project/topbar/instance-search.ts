import type { HomeLike, InstanceResource } from '@/entities/project/instance-resource'
import { listInstances } from '@/views/projects/instances.api'

/** Debounce of the search term. */
export const SEARCH_DEBOUNCE_MS = 300

/** The first 10 instances by name, filtered by the term. */
export const SEARCH_PAGE_SIZE = 10

export interface InstanceSearchOutcome {
  /** The request failed or found nothing. The caller keeps its previous results in that case. */
  error: boolean
  items: InstanceResource[]
}

/**
 * The first 10 instances by name, filtered by the term. A failed request and an empty list both mean
 * "not found" (`searchError`), as in legacy.
 */
export async function fetchInstanceSearch (term: string, home?: HomeLike | null): Promise<InstanceSearchOutcome> {
  try {
    const { data } = await listInstances({
      page: 1,
      perPage: SEARCH_PAGE_SIZE,
      sortBy: 'name',
      sortDir: 'asc',
      searchTerm: term,
      home,
    })
    return data.length > 0 ? { error: false, items: data } : { error: true, items: [] }
  } catch {
    return { error: true, items: [] }
  }
}
