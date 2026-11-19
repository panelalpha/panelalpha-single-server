// Copy and test ids of the page titles: written on the hand-made headers, kept green on `PageTitle`,
// `AdvancedPageLayout` and `PageAddButton`. Each title key, Add label key and test id below stays in its file, so the migration keeps the
// copy, the probes and the selectors of the tests.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')

const CONSUMERS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['views/projects/project/advanced/cdn/CdnView.vue', ['heading.instance.advanced.cdn.title']],
  ['views/projects/project/advanced/edge-cache/EdgeCacheView.vue', ['heading.instance.advanced.edge-cache.title']],
  ['views/projects/project/advanced/cloudflare/CloudflareView.vue', ['heading.instance.advanced.cloudflare.title']],
  ['views/projects/project/advanced/wordpress-mcp/WordpressMcpView.vue', ['heading.instance.advanced.wordpressMcp.title']],
  ['views/projects/project/advanced/developer-settings/DeveloperSettingsView.vue', ['heading.instance.advanced.developer.title']],
  ['views/projects/project/advanced/details/DetailsView.vue', ['heading.instance.advanced.siteDetails.title']],
  ['views/projects/project/advanced/copy-instance/CopyInstanceView.vue', ['heading.instance.advanced.copyInstance.title']],
  ['views/projects/project/advanced/git/GitView.vue', ['heading.instance.advanced.git.title']],
  ['views/projects/project/advanced/security/SecurityView.vue', ['heading.instance.advanced.security.title']],
  ['views/projects/project/advanced/auto-updates/AutoUpdatesView.vue', ['heading.instance.advanced.autoUpdates.title']],
  ['views/projects/project/advanced/users/UsersView.vue', ['heading.instance.advanced.users.title', 'button.user.create', 'users-search', 'users-add']],
  ['views/projects/project/advanced/wordpress-users/WordpressUsersView.vue', ['heading.instance.advanced.users.title', 'button.user.create', 'wordpress-users-search', 'wordpress-users-add']],
  ['views/projects/project/advanced/wordpress-config/WordpressConfigView.vue', ['heading.instance.advanced.wordpressConfig.title', 'button.config.create', 'wordpress-config-search', 'wordpress-config-add']],
  ['views/projects/project/advanced/env-file/EnvFileView.vue', ['heading.instance.advanced.envFile.title', 'heading.instance.advanced.envFile.addVariable', 'heading.instance.advanced.envFile.import', 'env-title', 'env-search', 'env-import', 'env-add']],
  ['views/projects/project/advanced/logs/LogsView.vue', ['heading.instance.advanced.logs.instanceLogs.title', 'deployLogs.title', 'heading.instance.advanced.logs.wordpressLogs.title', 'heading.instance.advanced.logs.phpLogs.title', 'heading.instance.advanced.logs.phpLogs.tooltip', 'heading.instance.advanced.logs.webserverLogs.title']],
  ['views/projects/project/advanced/themes/ThemesView.vue', ['heading.instance.advanced.theme.title', 'heading.instance.advanced.theme.add.title', 'button.addNew', 'button.back']],
  ['views/projects/project/backups/BackupsView.vue', ['heading.instance.backups.title', 'button.addNew', 'backups-add-new']],
  ['views/projects/project/plugins/PluginsView.vue', ['heading.instance.plugin.title', 'heading.instance.plugin.add.title', 'button.addNew', 'button.back']],
  ['views/projects/project/monitoring/MonitoringView.vue', ['heading.instance.siteDetails.analytics.title']],
  ['views/hosting/cron/CronView.vue', ['heading.hosting.cron.title', 'button.cron.add', 'cron-title', 'cron-account-selector', 'cron-add']],
  ['views/hosting/domains/DomainsView.vue', ['heading.hosting.domains.title', 'button.domain.add', 'domains-title', 'domains-controls', 'domains-account-selector', 'domains-add']],
  ['views/hosting/databases/DatabasesView.vue', ['heading.hosting.databases.title', 'databases-title', 'databases-filter-controls', 'databases-add']],
  ['views/hosting/ftp/FtpView.vue', ['heading.hosting.ftp.title', 'button.ftp.add', 'ftp-title', 'ftp-account-selector', 'ftp-search', 'ftp-add']],
  ['views/hosting/sftp/SftpView.vue', ['heading.hosting.${pageType}.title', 'button.${pageType}.add', 'button.actions', 'sftp-title', 'sftp-account-selector', 'sftp-search', 'sftp-add']],
  ['views/hosting/containers/ContainersView.vue', ['heading.hosting.containers.title', 'button.actions', 'containers-title', 'containers-actions']],
  ['views/hosting/file-manager/FileManagerView.vue', ['heading.hosting.fileManager.title', 'heading.hosting.fileManager.alert.wpCloud', 'file-manager-title', 'file-manager-account-selector', 'file-manager-wp-cloud-alert']],
  ['views/hosting/dns/DnsView.vue', ['heading.hosting.dns.title', 'button.dns.add', 'heading.hosting.dns.zones.title', 'dns-title', 'dns-zone-select', 'dns-account-selector', 'dns-add']],
  ['views/hosting/email-addresses/EmailAddressesView.vue', ['heading.hosting.emailAddress.title', 'emailAddress.addAddress', 'email-addresses-title', 'email-addresses-search', 'email-addresses-add', 'email-addresses-domain']],
  ['views/hosting/email-forwarders/EmailForwardersView.vue', ['heading.hosting.emailForwarders.title', 'button.emailForwarder.add', 'email-forwarders-title', 'email-forwarders-search', 'email-forwarders-add', 'email-forwarders-domain']],
  ['views/hosting/summary/SummaryView.vue', ['heading.hosting.summary.title', 'button.login.controlPanel', 'summary-title', 'summary-sso', 'summary-account-selector']],
  ['views/hosting/HostingView.vue', ['button.fullServerManagement', 'usage-admin-button']],
  ['views/reseller/users/UsersTable.vue', ['heading.reseller.page.users', 'reseller-users-title']],
  ['views/reseller/logs/LogsTable.vue', ['heading.reseller.page.logs', 'reseller-logs-title']],
  ['views/reseller/api/ApiTokensTable.vue', ['heading.reseller.page.api', 'button.apiToken.create', 'reseller-api-title', 'reseller-api-create', 'reseller-api-create-empty']],
  ['views/reseller/branding/BrandingView.vue', ['heading.reseller.page.branding', 'heading.reseller.page.dnsrecord']],
  ['views/reseller/email-settings/EmailSettingsView.vue', ['heading.reseller.page.emailSettings', 'reseller-email-settings-title']],
  ['views/connect-ai/ConnectAiView.vue', ['heading.connectAi.serverUrl', 'heading.connectAi.tokens', 'button.connectAi.createToken', 'connect-ai-server-url-title', 'connect-ai-tokens-title', 'connect-ai-create-token']],
  ['views/connect-ai/McpCapabilities.vue', ['heading.connectAi.capabilities', 'connect-ai-capabilities-title']],
  ['views/connect-ai/McpToolPanel.vue', ['heading.connectAi.connectTool', 'connect-ai-panel-title']],
  ['views/connect-ai/McpActivityLog.vue', ['heading.connectAi.activityLog', 'heading.connectAi.filterByToken', 'connect-ai-activity-title', 'connect-ai-activity-filter']],
  ['views/account/billing/BillingView.vue', ['heading.billing.invoice.title', 'billing-invoices-title', 'billing-search']],
]

describe('page title consumers', () => {
  it('lists the 41 files of the family', () => {
    expect(CONSUMERS).toHaveLength(41)
  })

  it.each(CONSUMERS)('%s keeps its title copy, Add label and test ids', (file, needles) => {
    const text = readFileSync(join(SRC, file), 'utf8')
    expect(needles.filter(needle => !text.includes(needle))).toEqual([])
  })
})
