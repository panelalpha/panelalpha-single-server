// Copy, test ids and handlers of the empty states written on the hand-made empty states, kept green on
// `EmptyState` and `PageAddButton`. Each key, test id and handler below stays in its file, so the migration keeps the copy, the probes and
// the actions. `reseller.logs.noLogs` in the reseller Users table is the legacy copy, kept 1:1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')

const CONSUMERS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['views/hosting/cron/CronView.vue', ['message.emptyTable.cron.title', 'message.emptyTable.cron.description', 'button.cron.add', 'cron-empty-add', 'openAdd']],
  ['views/hosting/ftp/FtpView.vue', ['message.emptyTable.ftp.title', 'message.emptyTable.ftp.description', 'button.ftp.add', 'ftp-empty', 'ftp-empty-add', 'loadAddModal']],
  ['views/hosting/sftp/SftpView.vue', ['message.emptyTable.${pageType}.title', 'message.emptyTable.${pageType}.description', 'button.${pageType}.add', 'sftp-empty', 'sftp-empty-add', 'showAddModal']],
  ['views/hosting/domains/DomainsView.vue', ['message.emptyTable.domain.title', 'message.emptyTable.domain.description', 'button.domain.add', 'domains-empty', 'domains-empty-add', 'actions.openAdd()']],
  ['views/hosting/dns/DnsView.vue', ['message.emptyTable.dns.title', 'message.emptyTable.dns.description']],
  ['views/hosting/databases/DatabasesView.vue', ['message.emptyTable.databases.database.title', 'message.emptyTable.databases.database.description', 'message.emptyTable.databases.users.title', 'message.emptyTable.databases.users.description', 'button.database.add', 'button.user.add', 'databases-empty', 'users-empty', 'onAddClick']],
  ['views/hosting/email-addresses/EmailAddressesView.vue', ['message.emptyTable.emailAddress.title', 'message.emptyTable.emailAddress.description', 'button.emailAddress.add', 'email-addresses-empty', 'email-addresses-empty-add', 'openAddModal']],
  ['views/hosting/email-forwarders/EmailForwardersView.vue', ['message.emptyTable.emailForwarders.title', 'message.emptyTable.emailForwarders.description', 'button.emailForwarder.add', 'email-forwarders-empty', 'email-forwarders-empty-add', 'openAddModal']],
  ['views/hosting/containers/ContainersEmpty.vue', ['message.emptyTable.containers.title', 'message.emptyTable.containers.description', 'containers-empty', '<EmptyState']],
  ['views/hosting/summary/HostingInstancesCard.vue', ['message.emptyTable.instances.title', 'message.emptyTable.projects.subtitle', 'button.addNew', 'summary-instances-empty', 'summary-instances-add', 'startInstallation']],
  ['views/hosting/NoAvailableHostingView.vue', ['general.instancesSuspended', 'general.instancesSuspendedDescription', 'hosting-suspended-card', 'hosting-suspended-upgrade', 'hosting-suspended-support']],
  ['views/projects/project/advanced/env-file/EnvFileView.vue', ['heading.instance.advanced.envFile.empty.title', 'heading.instance.advanced.envFile.empty.description', 'heading.instance.advanced.envFile.import', 'heading.instance.advanced.envFile.addVariable', 'env-empty', 'env-empty-import', 'env-empty-add', 'showImportModal', 'showAddModal']],
  ['views/projects/project/advanced/users/UsersView.vue', ['heading.instance.advanced.users.noData', 'users-empty']],
  ['views/projects/project/advanced/wordpress-users/WordpressUsersTable.vue', ['heading.instance.advanced.users.noData', 'wordpress-users-empty']],
  ['views/projects/project/advanced/git/GitLogsTable.vue', ['message.emptyTable.gitLogs.title', 'message.emptyTable.gitLogs.description', 'git-logs-empty']],
  ['views/projects/project/advanced/logs/LogsView.vue', ['message.emptyTable.wpErrorLogs.title', 'message.emptyTable.wpErrorLogs.description', 'message.emptyTable.webserverLogs.title', 'message.emptyTable.webserverLogs.description', 'message.emptyTable.webserverLogs.downloadTitle', 'message.emptyTable.webserverLogs.downloadDescription', 'downloadSelectedWebserverLog', 'logs-panel-height']],
  ['views/projects/project/advanced/logs/LogsTable.vue', ['message.emptyTable.instanceLogs.title', 'message.emptyTable.instanceLogs.description', 'instance-logs-empty']],
  ['views/projects/project/advanced/logs/LogLinesTable.vue', ['message.emptyTable.webserverLogs.title', 'message.emptyTable.webserverLogs.description', 'message.emptyTable.phpLogs.title', 'message.emptyTable.phpLogs.description', 'message.emptyTable.wpErrorLogs.title', 'message.emptyTable.wpErrorLogs.description', 'deployLogs.noLines']],
  ['views/projects/project/advanced/logs/DeployLogsTab.vue', ['deployLogs.noDeploys', 'deployLogs.noDeploysSubtitle', 'logs-panel-height']],
  ['views/projects/project/advanced/logs/LogsNoData.vue', ['button.download', '$downloadcloud', 'emit(\'download\')']],
  ['views/projects/project/advanced/themes/ThemesView.vue', ['message.emptyTable.theme.add.title', 'message.emptyTable.theme.add.description', 'message.emptyTable.theme.title', 'message.emptyTable.theme.description', 'button.back', 'button.addNew', 'closeAddNew', 'openAddNew']],
  ['views/projects/project/plugins/PluginsView.vue', ['message.emptyTable.plugin.title', 'message.emptyTable.plugin.description', 'heading.instance.plugin.add.empty.title', 'heading.instance.plugin.add.empty.text', 'button.back', 'button.addNew', 'closeAddNew', 'openAddNew']],
  ['views/projects/project/monitoring/MonitoringView.vue', ['message.emptyTable.monitoring.title', 'message.emptyTable.monitoring.description']],
  ['views/projects/project/backups/BackupsTable.vue', ['message.emptyTable.backups.title', 'message.emptyTable.backups.description', 'button.createBackup', 'backups-empty', 'backups-empty-add', 'createDisabled', 'emit(\'add-new\')']],
  ['views/projects/InstanceNoData.vue', ['general.greeting', 'message.emptyTable.instances.title', 'message.emptyTable.projects.subtitle', 'button.instance.create', 'instances-no-data', 'instances-no-data-card', 'instances-no-data-title', 'instances-no-data-create', 'loadServices']],
  ['views/account/profile/DevicesTable.vue', ['message.emptyTable.activeDevices.title', 'message.emptyTable.activeDevices.description', 'account-devices-empty']],
  ['views/account/services/ServicesTable.vue', ['message.emptyTable.services.title', 'services-empty']],
  ['views/account/tasks/TasksView.vue', ['tasks.empty.title', 'tasks.empty.description', 'tasks-empty']],
  ['views/account/billing/NoAvailableInvoicesView.vue', ['heading.billing.noData.title', 'heading.billing.noData.text', 'button.dashboard.back', 'billing-empty', 'billing-empty-back', 'preferredSpaBase(session.home)']],
  ['views/reseller/api/ApiTokensTable.vue', ['reseller.apiTokens.noTokens', 'reseller.apiTokens.noTokensDesc', 'button.apiToken.create', 'reseller-api-empty', 'reseller-api-create-empty', 'createModal?.open()']],
  ['views/reseller/users/UsersTable.vue', ['reseller.logs.noLogs', 'reseller.logs.noLogsDesc', 'reseller-users-empty']],
  ['views/reseller/logs/LogsTable.vue', ['reseller.logs.noLogs', 'reseller.logs.noLogsDesc', 'reseller-logs-empty']],
  ['views/connect-ai/McpActivityLog.vue', ['heading.connectAi.noActivityLogsTitle', 'heading.connectAi.noActivityLogs', 'connect-ai-logs-empty']],
  ['views/connect-ai/McpTokensSection.vue', ['heading.connectAi.noTokens', 'heading.connectAi.noTokensHint', 'connect-ai-tokens-empty']],
]

describe('empty state consumers', () => {
  it('lists the 34 files of the family', () => {
    expect(CONSUMERS).toHaveLength(34)
  })

  it.each(CONSUMERS)('%s keeps its empty-state copy, test ids and handlers', (file, needles) => {
    const text = readFileSync(join(SRC, file), 'utf8')
    expect(needles.filter(needle => !text.includes(needle))).toEqual([])
  })
})
