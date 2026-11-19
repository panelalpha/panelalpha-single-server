import { describe, expect, it } from 'vitest'
import {
  availableDiskSpace,
  forceSkipUploadsDir,
  hideDiskUsage,
  inPanelAlphaOnlineZone,
  isStagingBillable,
  isValidDomain,
  loadDomainParser,
  needsDomainParser,
  stagingDomainParts,
  stagingOnSeparateAccount,
  uploadsDirUsage,
  wpDiskUsage,
} from './create-staging'

const MB = 1024 ** 2

describe('stagingDomainParts', () => {
  it('defaults to staging.<domain> under the instance domain', () => {
    expect(stagingDomainParts({ domain: 'acme.com', plan_settings: { domain_for_staging: { type: 'same_domain' } } })).toEqual({
      allowAnyDomain: false,
      subdomain: 'staging',
      parentDomain: 'acme.com',
      suffix: '.',
      domain: 'staging.acme.com',
      assignedByEngine: false,
    })
  })

  it('lets the Engine name the copy of a site on panelalpha.online, where a typed name would not answer', () => {
    expect(stagingDomainParts({ domain: 'shop.panelalpha.online', plan_settings: { domain_for_staging: { type: 'same_domain' } } })).toEqual({
      allowAnyDomain: false,
      subdomain: '',
      parentDomain: 'shop.panelalpha.online',
      suffix: '',
      domain: '',
      assignedByEngine: true,
    })
  })

  it('does the same under a fixed panelalpha.online base', () => {
    const parts = stagingDomainParts({ domain: 'acme.com', plan_settings: { domain_for_staging: { type: 'fixed_subdomain', fixed_domain: 'panelalpha.online' } } })
    expect(parts.assignedByEngine).toBe(true)
    expect(parts.domain).toBe('')
  })

  it('keeps the typed domain for an any_domain plan on panelalpha.online, where the API refuses it', () => {
    expect(stagingDomainParts({ domain: 'shop.panelalpha.online', plan_settings: { domain_for_staging: { type: 'any_domain' } } }).assignedByEngine).toBe(false)
  })

  it('uses the fixed domain of a fixed_subdomain plan as the parent', () => {
    const parts = stagingDomainParts({ domain: 'acme.com', plan_settings: { domain_for_staging: { type: 'fixed_subdomain', fixed_domain: 'sites.host.io' } } })
    expect(parts.parentDomain).toBe('sites.host.io')
    expect(parts.domain).toBe('staging.sites.host.io')
  })

  it('allows any domain for an any_domain plan', () => {
    expect(stagingDomainParts({ domain: 'acme.com', plan_settings: { domain_for_staging: { type: 'any_domain' } } }).allowAnyDomain).toBe(true)
  })

  it('needs the suffix list only when nested subdomains are converted, and keeps the dot until it is loaded', () => {
    const settings = { domain_for_staging: { type: 'same_domain' }, convert_nested_subdomains_for_staging: true }
    expect(needsDomainParser({ plan_settings: settings })).toBe(true)
    expect(needsDomainParser({ plan_settings: { domain_for_staging: { type: 'same_domain' } } })).toBe(false)
    expect(stagingDomainParts({ domain: 'blog.acme.com', plan_settings: settings }).suffix).toBe('.')
  })

  it('joins with a dash when nested subdomains are converted and the domain has a subdomain', async () => {
    await loadDomainParser()
    const settings = { domain_for_staging: { type: 'same_domain' }, convert_nested_subdomains_for_staging: true }
    expect(stagingDomainParts({ domain: 'blog.acme.com', plan_settings: settings }).suffix).toBe('-')
    expect(stagingDomainParts({ domain: 'blog.acme.com', plan_settings: settings }).domain).toBe('staging-blog.acme.com')
  })

  it('keeps the dot without the conversion flag', () => {
    expect(stagingDomainParts({ domain: 'blog.acme.com', plan_settings: { domain_for_staging: { type: 'same_domain' } } }).suffix).toBe('.')
  })
})

describe('settings flags', () => {
  it('reads separate accounts and billing from server_settings', () => {
    expect(stagingOnSeparateAccount({ server_settings: { force_separate_accounts: true } })).toBe(true)
    expect(isStagingBillable({ server_settings: { is_staging_billable: true } })).toBe(true)
    expect(isStagingBillable({})).toBe(false)
  })

  it('hides the disk block for separate accounts and (app-lite) for custom projects', () => {
    expect(hideDiskUsage({ server_settings: { force_separate_accounts: true } })).toBe(true)
    expect(hideDiskUsage({ type: 'custom' })).toBe(true)
    expect(hideDiskUsage({ type: 'wordpress' })).toBe(false)
    expect(hideDiskUsage({})).toBe(false)
  })
})

describe('disk usage', () => {
  const usage = { account_usage: 200 * MB, account_limit: 1024 * MB, wordpress_dir_usage: 500 * MB, uploads_dir_usage: 300 * MB, wordpress_db_usage: 50 * MB }

  it('formats usage and free space', () => {
    expect(wpDiskUsage(usage)).toBe('550 MB')
    expect(uploadsDirUsage(usage)).toBe('300 MB')
    expect(availableDiskSpace(usage, 'Unlimited')).toBe('824 MB')
  })

  it('shows the unlimited label without a limit and 0 B past the limit', () => {
    expect(availableDiskSpace({ ...usage, account_limit: null }, 'Unlimited')).toBe('Unlimited')
    expect(availableDiskSpace({ ...usage, account_usage: 2048 * MB }, 'Unlimited')).toBe('0 B')
  })

  it('forces skipping uploads only when files plus database exceed the free space', () => {
    expect(forceSkipUploadsDir(usage)).toBe(false)
    expect(forceSkipUploadsDir({ ...usage, account_usage: 800 * MB })).toBe(true)
    expect(forceSkipUploadsDir({ ...usage, account_limit: null })).toBe(false)
  })
})

describe('isValidDomain', () => {
  it('accepts hostnames and rejects bare words', () => {
    expect(isValidDomain('staging.acme.com')).toBe(true)
    expect(isValidDomain('staging-blog.acme.co.uk')).toBe(true)
    expect(isValidDomain('acme')).toBe(false)
    expect(isValidDomain('')).toBe(false)
  })
})

describe('inPanelAlphaOnlineZone', () => {
  it('matches the zone and its subdomains', () => {
    expect(inPanelAlphaOnlineZone('panelalpha.online')).toBe(true)
    expect(inPanelAlphaOnlineZone(' Shop.PanelAlpha.Online. ')).toBe(true)
    expect(inPanelAlphaOnlineZone('staging.shop.panelalpha.online')).toBe(true)
    expect(inPanelAlphaOnlineZone('shop.panelalpha.direct')).toBe(false)
    expect(inPanelAlphaOnlineZone('notpanelalpha.online')).toBe(false)
    expect(inPanelAlphaOnlineZone(null)).toBe(false)
  })
})
