import type { FreeSitesBaseDomain } from './sites-base-domain.api'
import { describe, expect, it } from 'vitest'
import { exampleName, projectDomainLines } from './project-domains'

// t(key) shows the key and its options, so the tests see which sentence was picked and with what.
const t = (key: string, options?: Record<string, unknown>) => options ? `${key}(${JSON.stringify(options)})` : key

const ONLINE = { base: 'panelalpha.online', source: 'panelalpha_online', suffixed: true, publicly_resolvable: true }
const DIRECT = { base: '198-51-100-118.panelalpha.direct', source: 'panelalpha_direct', suffixed: false, publicly_resolvable: true }
const LOCAL = { base: 'local', source: 'local', suffixed: false, publicly_resolvable: false }
const OWN = { base: 'apps.example.com', source: 'sites_base_domain', suffixed: false, publicly_resolvable: null }

function info (override: Partial<FreeSitesBaseDomain> = {}): FreeSitesBaseDomain {
  return {
    sites_base_domain: null,
    project_domain_bases: [ONLINE, DIRECT, LOCAL],
    certificate_issuer: 'self_signed',
    shared_zone_issuance: false,
    panelalpha_online_error: null,
    ...override,
  }
}

describe('project domain lines (ID-51)', () => {
  it('names a project like the Engine does', () => {
    expect(exampleName(ONLINE)).toBe('<project>-xxxx.panelalpha.online')
    expect(exampleName(DIRECT)).toBe('<project>.198-51-100-118.panelalpha.direct')
  })

  it('without a base domain: PanelAlpha Online first, then the direct name; local is left out', () => {
    expect(projectDomainLines(info(), t)).toEqual([
      { example: '<project>-xxxx.panelalpha.online', note: 'settings.projectDomains.panelalphaOnline', fallback: false },
      {
        example: '<project>.198-51-100-118.panelalpha.direct',
        note: 'settings.projectDomains.panelalphaDirect settings.projectDomains.certificateSelfSigned',
        fallback: true,
      },
    ])
  })

  it('says why PanelAlpha Online names are unavailable', () => {
    const [first] = projectDomainLines(info({ panelalpha_online_error: 'Site quota used up' }), t)

    expect(first!.note).toBe('settings.projectDomains.panelalphaOnline settings.projectDomains.onlineUnavailable({"error":"Site quota used up"})')
  })

  it('with a base domain: the own domain first, its certificate from the issuer', () => {
    const own = info({ sites_base_domain: 'apps.example.com', project_domain_bases: [OWN, ONLINE, DIRECT, LOCAL], certificate_issuer: 'acme' })
    const lines = projectDomainLines(own, t)

    expect(lines[0]).toEqual({
      example: '<project>.apps.example.com',
      note: 'settings.projectDomains.sitesBaseDomain({"base":"apps.example.com"}) settings.projectDomains.certificateAcme',
      fallback: false,
    })
    // Let's Encrypt on, but not in the shared panelalpha.direct zone unless shared-zone issuance is on.
    expect(lines[2]!.note).toContain('settings.projectDomains.certificateSelfSigned')
    expect(projectDomainLines({ ...own, shared_zone_issuance: true }, t)[2]!.note).toContain('settings.projectDomains.certificateAcme')
  })

  it('shows a name that answers nowhere only when it is the default, and says so', () => {
    expect(projectDomainLines(info({ project_domain_bases: [LOCAL] }), t)).toEqual([
      { example: '<project>.local', note: 'settings.projectDomains.local', fallback: false },
    ])
    const unreachable = { ...DIRECT, publicly_resolvable: false }
    expect(projectDomainLines(info({ project_domain_bases: [unreachable, LOCAL] }), t)).toEqual([
      {
        example: '<project>.198-51-100-118.panelalpha.direct',
        note: 'settings.projectDomains.panelalphaDirect settings.projectDomains.certificateSelfSigned settings.projectDomains.notPublic',
        fallback: false,
      },
    ])
  })

  it('an Engine without project_domain_bases: the configured base only, or nothing', () => {
    expect(projectDomainLines(info({ project_domain_bases: null }), t)).toEqual([])
    expect(projectDomainLines(info({ project_domain_bases: null, sites_base_domain: 'apps.example.com' }), t)).toEqual([
      { example: '<project>.apps.example.com', note: 'settings.projectDomains.sitesBaseDomain({"base":"apps.example.com"})', fallback: false },
    ])
  })
})
