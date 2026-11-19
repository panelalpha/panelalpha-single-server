import { api } from '@/shared/api/client'

// Not in legacy: the Engine's sites base domain, read and set on its own request (it asks the Engine, so it may fail while General
// loads). Flat bodies, as the other Free settings routes.

/** One rung of the Engine's naming ladder (`system/info.project_domain_bases`). */
export interface ProjectDomainBase {
  base: string
  /** `sites_base_domain`, `panelalpha_online`, `panelalpha_direct` or `local`. */
  source: string
  /** The project is named `<name>-<4 hex>` there (a PanelAlpha Online label bought at create time). */
  suffixed: boolean
  /** Whether a name there reaches the server from the internet; null where the DNS is not the Engine's. */
  publicly_resolvable: boolean | null
}

export interface FreeSitesBaseDomain {
  /** The domain new projects without one of their own are named under (`<project>.<domain>`); null when the Engine has none. */
  sites_base_domain: string | null
  /** Where a new project is named, best first; null from an Engine that does not report it. */
  project_domain_bases: ProjectDomainBase[] | null
  /** `self_signed` or `acme` (Let's Encrypt). */
  certificate_issuer: string | null
  /** Whether the Engine issues real certificates in the zones every Engine shares (panelalpha.direct). */
  shared_zone_issuance: boolean
  /** Why PanelAlpha Online names were refused last; null while they are sold. */
  panelalpha_online_error: string | null
}

/** `GET /community/settings/sites-base-domain` (no cache). */
export async function getFreeSitesBaseDomain (): Promise<FreeSitesBaseDomain> {
  const { data } = await api.get<FreeSitesBaseDomain>('/community/settings/sites-base-domain')
  return data
}

/** `PUT /community/settings/sites-base-domain`; an empty string clears it. Answers what GET answers, after the change. */
export async function updateFreeSitesBaseDomain (domain: string): Promise<FreeSitesBaseDomain> {
  const { data } = await api.put<FreeSitesBaseDomain>('/community/settings/sites-base-domain', { sites_base_domain: domain })
  return data
}
