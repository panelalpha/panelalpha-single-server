// Not in legacy: what the Settings page tells the owner about the names new projects get, from the Engine's own ladder
// (`project_domain_bases`, best first). Vue-free, so the wording rules are unit-tested without mounting.
import type { Translate } from './settings-general'
import type { FreeSitesBaseDomain, ProjectDomainBase } from './sites-base-domain.api'

export interface ProjectDomainLine {
  /** The name a project called `<project>` would get there. */
  example: string
  /** One or two sentences: what the name is and its certificate. */
  note: string
  /** False for the default, true for each one used when the one before cannot be had. */
  fallback: boolean
}

// The zones every Engine shares: a real certificate there needs `shared_zone_issuance`.
const SHARED_ZONES = ['panelalpha.direct', 'panelalpha.online', 'sslip.io', 'nip.io']

function inSharedZone (base: string): boolean {
  return SHARED_ZONES.some(zone => base === zone || base.endsWith(`.${zone}`))
}

/** `<project>.<base>`, or `<project>-xxxx.<base>` where the Engine adds a random suffix. */
export function exampleName (base: ProjectDomainBase): string {
  return `<project>${base.suffixed ? '-xxxx' : ''}.${base.base}`
}

function certificate (info: FreeSitesBaseDomain, base: string, t: Translate): string {
  const real = info.certificate_issuer === 'acme' && (info.shared_zone_issuance || !inSharedZone(base))
  return t(real ? 'settings.projectDomains.certificateAcme' : 'settings.projectDomains.certificateSelfSigned')
}

function noteFor (base: ProjectDomainBase, info: FreeSitesBaseDomain, t: Translate): string {
  const parts: string[] = []
  switch (base.source) {
    case 'sites_base_domain': {
      parts.push(t('settings.projectDomains.sitesBaseDomain', { base: base.base }), certificate(info, base.base, t))
      break
    }
    case 'panelalpha_online': {
      parts.push(t('settings.projectDomains.panelalphaOnline'))
      if (info.panelalpha_online_error) {
        parts.push(t('settings.projectDomains.onlineUnavailable', { error: info.panelalpha_online_error }))
      }
      break
    }
    case 'panelalpha_direct': {
      parts.push(t('settings.projectDomains.panelalphaDirect'), certificate(info, base.base, t))
      break
    }
    case 'local': {
      parts.push(t('settings.projectDomains.local'))
      break
    }
  }
  if (base.publicly_resolvable === false && base.source !== 'local') {
    parts.push(t('settings.projectDomains.notPublic'))
  }
  return parts.join(' ')
}

/**
 * The default name first, then the fallbacks a visitor could reach (a name that answers nowhere, such as `local`, is shown only when it
 * is the default). An Engine without `project_domain_bases` gives the configured base only, or nothing.
 */
export function projectDomainLines (info: FreeSitesBaseDomain, t: Translate): ProjectDomainLine[] {
  const bases = info.project_domain_bases
  if (!bases || bases.length === 0) {
    return info.sites_base_domain
      ? [{ example: `<project>.${info.sites_base_domain}`, note: t('settings.projectDomains.sitesBaseDomain', { base: info.sites_base_domain }), fallback: false }]
      : []
  }
  return bases
    .filter((base, index) => index === 0 || base.publicly_resolvable !== false)
    .map((base, index) => ({ example: exampleName(base), note: noteFor(base, info, t), fallback: index > 0 }))
}
