import { describe, expect, it } from 'vitest'
import { buildPlanUsage, buildPlanUsageHeader, formatAmount, formatBytesOrInfinity, isRowVisible, spaceColor, usedPercent } from './plan-usage'

const GB = 1024 ** 3

describe('formatters', () => {
  it('null is the infinity sign, anything else is formatted', () => {
    expect(formatBytesOrInfinity(null)).toBe('∞')
    expect(formatBytesOrInfinity(GB)).toBe('1 GB')
    expect(formatBytesOrInfinity(0)).toBe('0 B')
    expect(formatAmount(null)).toBe('∞')
    expect(formatAmount(5)).toBe(5)
    expect(formatAmount(0)).toBe(0)
  })
})

describe('buildPlanUsageHeader', () => {
  const usage = {
    disk_usage: { usage: GB, maximum: 5 * GB },
    email_storage: { usage: 1024 ** 2, maximum: GB },
    email_accounts: { usage: 3, maximum: null },
  }

  it('starts with the disk tile', () => {
    expect(buildPlanUsageHeader(usage, {})).toEqual([
      { title: 'disk', icon: 'diskspaceIcon', available: 5 * GB, availableText: '5 GB', value: GB, valueText: '1 GB' },
    ])
  })

  it('adds email storage when supported (preferred over the account count)', () => {
    const header = buildPlanUsageHeader(usage, { email_storage: true, email_accounts: true })
    expect(header).toHaveLength(2)
    expect(header[1]).toEqual({ title: 'email', icon: 'emailaccountsIcon', available: GB, availableText: '1 GB', value: 1024 ** 2, valueText: '1 MB' })
  })

  it('falls back to the email account count, with ∞ for no limit', () => {
    const header = buildPlanUsageHeader(usage, { email_accounts: true })
    expect(header[1]).toEqual({ title: 'email', icon: 'emailaccountsIcon', available: null, availableText: '∞', value: 3, valueText: '3' })
  })

  it('shows an unlimited disk as ∞', () => {
    expect(buildPlanUsageHeader({ disk_usage: { usage: 10, maximum: null } }, {})[0]).toMatchObject({ available: null, availableText: '∞' })
  })
})

describe('buildPlanUsage', () => {
  const usage = {
    bandwidth: { usage: 2 * GB, maximum: 100 * GB },
    ftp_accounts: { usage: 1, maximum: 10 },
    sftp_accounts: { usage: 0, maximum: null },
    mysql_databases: { usage: 2, maximum: 20 },
    addon_domains: { usage: 1, maximum: 5 },
    subdomains: { usage: 2, maximum: null },
    aliases: { usage: 0, maximum: null },
    email_accounts: { usage: 4, maximum: 50 },
    email_storage: { usage: 1024 ** 2, maximum: GB },
  }
  const all = Object.fromEntries(Object.keys(usage).map(key => [key, true]))

  it('gives no rows without usage', () => {
    expect(buildPlanUsage({}, all)).toEqual([])
  })

  it('lists supported metrics in the legacy order', () => {
    expect(buildPlanUsage(usage, all).map(row => row.name)).toEqual(['bandwidth', 'ftp', 'sftp', 'mysql', 'addonDomains', 'subdomains', 'aliases', 'email', 'email_storage'])
  })

  it('skips metrics that are not supported', () => {
    expect(buildPlanUsage(usage, { bandwidth: true, ftp_accounts: false, mysql_databases: true }).map(row => row.name)).toEqual(['bandwidth', 'mysql'])
  })

  it('formats bytes rows and counts rows differently', () => {
    const [bandwidth, ftp] = buildPlanUsage(usage, all)
    expect(bandwidth).toMatchObject({ value: 2 * GB, valueText: '2 GB', maxValue: 100 * GB, maxValueText: '100 GB' })
    expect(bandwidth!.url).toBeUndefined()
    expect(bandwidth!.privilege).toBeUndefined()
    expect(ftp).toMatchObject({ value: 1, valueText: 1, maxValue: 10, maxValueText: 10, url: '/hosting/ftp', privilege: 'hosting.manage_ftp' })
  })

  it('shows no limit as ∞ and a NaN ring maximum', () => {
    const sftp = buildPlanUsage(usage, all).find(row => row.name === 'sftp')!
    expect(sftp.maxValueText).toBe('∞')
    expect(sftp.maxValue).toBeNaN()
  })

  it('points the rows at their subpage and privilege', () => {
    const rows = Object.fromEntries(buildPlanUsage(usage, all).map(row => [row.name, [row.url, row.privilege]]))
    expect(rows.mysql).toEqual(['/hosting/databases', 'hosting.manage_mysql'])
    expect(rows.addonDomains).toEqual(['/hosting/domains', 'hosting.manage_domains'])
    expect(rows.aliases).toEqual(['/hosting/domains', 'hosting.manage_domains'])
    expect(rows.email).toEqual(['/hosting/email-addresses', 'hosting.manage_email'])
    expect(rows.email_storage).toEqual(['/hosting/email-addresses', 'hosting.manage_email'])
  })

  it('shows a row only with its privilege on the service, bandwidth always', () => {
    const rows = buildPlanUsage(usage, all)
    const service = { privileges: ['hosting.manage_ftp'] }
    expect(rows.filter(row => isRowVisible(row, service)).map(row => row.name)).toEqual(['bandwidth', 'ftp'])
  })
})

describe('space tile', () => {
  it('rounds the percentage up', () => {
    expect(usedPercent(1, 3)).toBe(34)
    expect(usedPercent(GB, 5 * GB)).toBe(20)
  })

  it('is Infinity or NaN without a usable limit (the tile then shows an icon)', () => {
    expect(usedPercent(5, null)).toBe(Infinity)
    expect(usedPercent(0, null)).toBeNaN()
    expect(usedPercent(5, 0)).toBe(Infinity)
  })

  it('colours the ring by usage: success to 50 %, warning to 80 %, error above', () => {
    expect(spaceColor(50, 100)).toBe('success')
    expect(spaceColor(51, 100)).toBe('warning')
    expect(spaceColor(80, 100)).toBe('warning')
    expect(spaceColor(81, 100)).toBe('error')
  })

  it('is grey without a limit or with an unknown value', () => {
    expect(spaceColor(5, null)).toBe('var(--v-chart-progress-track)')
    expect(spaceColor('?', 100)).toBe('var(--v-chart-progress-track)')
  })
})
