// Characterization test: the wiring of every button of the consumers that move from a raw `v-btn` to
// `AppButton` (or `ModalCloseButton`). Per file, in template order: the conditions, the loop and key, the activator `v-bind`, the listeners,
// `disabled`, `loading`, the link (`href`, `to`, `target`, `rel`), `type`, `form`, `value`, `data-testid`, `aria-label`, `id`, `title`,
// `block`, the classes and the i18n keys of the label. The look attributes (`color`, `variant`, `elevation`, `size`, `icon`, `rounded`) are
// left out on purpose: the `kind` owns them now (one look). A migration that drops a handler, a test id or a label fails here.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const BUTTON = /<(v-btn|VBtn|AppButton|app-button|ModalCloseButton)(?![-\w])/g
const ATTRIBUTE = /([^\s=/>"']+)(?:="([^"]*)")?/g
const KEPT = /^(?:v-if|v-else-if|v-else|v-show|v-for|v-bind|v-on.*|@.*|:?(?:key|disabled|loading|href|to|target|rel|type|form|value|data-testid|aria-label|id|title|block|class))$/
const I18N_KEY = /\bt\(\s*'([^']+)'/g

// Files whose buttons are pinned.
const FILES = [
  'src/app/shell/NewInstanceFloatingButton.vue',
  'src/app/shell/navbar/AddNewInstanceButton.vue',
  'src/app/shell/navbar/AdminAreaDropdown.vue',
  'src/app/shell/navbar/UserInfoDropdown.vue',
  'src/app/shell/notifications/NotificationsDropdown.vue',
  'src/app/shell/notifications/NotificationsManager.vue',
  'src/app/shell/trial/TrialInfoBox.vue',
  'src/entities/domain/ui/DomainsNameserverChecker.vue',
  'src/entities/label/ui/AddNewLabel.vue',
  'src/entities/label/ui/AssignExistingLabel.vue',
  'src/entities/project/ui/CancelInstallationDialog.vue',
  'src/entities/project/ui/CreateStagingModal.vue',
  'src/entities/project/ui/DnsSslIndicator.vue',
  'src/entities/project/ui/ImportInstanceDetailsModal.vue',
  'src/entities/project/ui/InstanceAvatar.vue',
  'src/entities/project/ui/PreviewSiteModal.vue',
  'src/entities/project/ui/ShareAccessTable.vue',
  'src/entities/project/ui/ShareInviteForm.vue',
  'src/entities/project/ui/SharePersonCell.vue',
  'src/entities/project/ui/WpAdminSsoModal.vue',
  'src/entities/project/ui/backups/AutomaticBackupsConfirmation.vue',
  'src/entities/project/ui/backups/AutomaticBackupsModal.vue',
  'src/entities/project/ui/backups/BackupAutomaticSwitcher.vue',
  'src/entities/project/ui/deploy/DeployKeyPanel.vue',
  'src/entities/project/ui/deploy/DeployLogsModal.vue',
  'src/entities/project/ui/status-issues/IssueResolveModal.vue',
  'src/entities/project/ui/status-issues/StatusIndicator.vue',
  'src/entities/ssl/ui/PendingSslIndicator.vue',
  'src/entities/ssl/ui/SslEditModal.vue',
  'src/entities/sso/ui/PhpMyAdminSsoModal.vue',
  'src/shared/ui/alerts/ErrorAlert.vue',
  'src/shared/ui/alerts/SuccessAlert.vue',
  'src/shared/ui/auth-frame/AuthSocialButtons.vue',
  'src/shared/ui/data-iterator/DataIteratorFilter.vue',
  'src/shared/ui/data-iterator/DataIteratorFooter.vue',
  'src/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue',
  'src/shared/ui/labels/LabelChip.vue',
  'src/shared/ui/labels/LongValueBox.vue',
  'src/shared/ui/modal/BasicModalField.vue',
  'src/shared/ui/selection/SelectSnackbar.vue',
  'src/views/account/billing/BillingView.vue',
  'src/views/account/billing/InvoicesTable.vue',
  'src/views/account/profile/DevicesSnackbar.vue',
  'src/views/account/profile/MyAccountModal.vue',
  'src/views/account/profile/MyAccountView.vue',
  'src/views/account/services/CancelServiceButton.vue',
  'src/views/account/settings/SettingsView.vue',
  'src/views/account/settings/backups/BackupStorage.vue',
  'src/views/account/settings/hub/HubConnection.vue',
  'src/views/auth/AcceptInviteView.vue',
  'src/views/auth/ForgotPasswordView.vue',
  'src/views/auth/HubLoginView.vue',
  'src/views/auth/LoginView.vue',
  'src/views/auth/RegisterView.vue',
  'src/views/auth/ResetPasswordView.vue',
  'src/views/auth/VerifyEmail.vue',
  'src/views/connect-ai/McpToolPanel.vue',
  'src/views/hosting/domains/TransferDomainModal.vue',
  'src/views/hosting/file-manager/components/FmBreadcrumb.vue',
  'src/views/hosting/file-manager/components/FmInfoBlock.vue',
  'src/views/hosting/file-manager/components/FmNavbar.vue',
  'src/views/hosting/file-manager/modals/FmAudioPlayerModal.vue',
  'src/views/hosting/file-manager/modals/FmClipboardModal.vue',
  'src/views/hosting/file-manager/modals/FmCropModule.vue',
  'src/views/hosting/file-manager/modals/FmUploadModal.vue',
  'src/views/hosting/summary/HostingSummaryCard.vue',
  'src/views/hosting/summary/SummaryView.vue',
  'src/views/not-found/PageNotFoundView.vue',
  'src/views/projects/InstanceActionSnackbar.vue',
  'src/views/projects/InstanceItemActions.vue',
  'src/views/projects/InstanceItemMenu.vue',
  'src/views/projects/InstanceSubinstanceIndicator.vue',
  'src/views/projects/project/advanced/details/SiteDetailsCard.vue',
  'src/views/projects/project/advanced/developer-settings/PhpSettingsModal.vue',
  'src/views/projects/project/advanced/git/GitView.vue',
  'src/views/projects/project/advanced/logs/LogsView.vue',
  'src/views/projects/project/advanced/security/SslCertificateCard.vue',
  'src/views/projects/project/advanced/themes/NewThemeTable.vue',
  'src/views/projects/project/advanced/themes/ThemeSelectSnackbar.vue',
  'src/views/projects/project/backups/BackupsSelectSnackbar.vue',
  'src/views/projects/project/general/cards/FilesSourceInfoCard.vue',
  'src/views/projects/project/general/cards/GitSourceInfoCard.vue',
  'src/views/projects/project/general/cards/InstallationInfoCard.vue',
  'src/views/projects/project/general/cards/SecurityInfoCard.vue',
  'src/views/projects/project/general/cards/SiteDetailsInfoCard.vue',
  'src/views/projects/project/general/modals/FilesUploadVersionModal.vue',
  'src/views/projects/project/general/modals/GitRedeployModal.vue',
  'src/views/projects/project/plugins/NewPluginTable.vue',
  'src/views/projects/project/plugins/PluginsSelectSnackbar.vue',
  'src/views/projects/project/topbar/InstanceStatusTabAlert.vue',
  'src/views/projects/project/topbar/ReportProviderTrackingCodeModal.vue',
  'src/views/projects/project/topbar/SetYourDomainModal.vue',
  'src/views/projects/project/topbar/TopBarEditableTitle.vue',
  'src/views/projects/project/topbar/TopBarSubinstanceBar.vue',
  'src/views/reseller/branding/BrandingView.vue',
  'src/views/reseller/email-settings/EmailSettingsView.vue',
  'src/views/reseller/users/UserInstancesTooltip.vue',
  'src/views/style-manager/StyleManagerChangeFavicon.vue',
  'src/views/style-manager/StyleManagerEditor.vue',
  'src/views/style-manager/StyleManagerLogoBox.vue',
  'src/views/style-manager/StyleManagerMenu.vue',
  'src/views/wizard/WizardFooter.vue',
  'src/views/wizard/WizardHubCard.vue',
  'src/views/wizard/WizardStartPage.vue',
  'src/views/wizard/steps/PanelAlphaConnectStep.vue',
  'src/views/hosting/cron/CronView.vue',
  'src/views/hosting/dns/DnsView.vue',
  'src/views/hosting/domains/DomainsView.vue',
  'src/views/hosting/ftp/FtpView.vue',
  'src/views/hosting/sftp/SftpView.vue',
  'src/views/hosting/databases/DatabasesView.vue',
  'src/views/hosting/email-addresses/EmailAddressesView.vue',
  'src/views/hosting/email-forwarders/EmailForwardersView.vue',
  'src/views/hosting/containers/ContainersView.vue',
  'src/views/hosting/summary/HostingInstancesCard.vue',
  'src/views/hosting/HostingView.vue',
  'src/views/hosting/NoAvailableHostingView.vue',
  'src/views/projects/project/advanced/env-file/EnvFileView.vue',
  'src/views/projects/project/advanced/logs/LogsNoData.vue',
  'src/views/projects/InstanceNoData.vue',
  'src/views/projects/project/advanced/themes/ThemesView.vue',
  'src/views/projects/project/backups/BackupsTable.vue',
  'src/views/projects/project/plugins/PluginsView.vue',
  'src/views/account/billing/NoAvailableInvoicesView.vue',
  'src/views/account/services/ServicesTable.vue',
]

// The top-level `<template>` block only (column 0), with HTML comments removed.
function templateOf (text: string): string {
  const block = /^<template>[\s\S]+?^<\/template>/m.exec(text)
  return (block?.[0] ?? '').replaceAll(/<!--[\s\S]*?-->/g, '')
}

// End of the opening tag that starts at `start` (a `>` inside a quoted value does not count).
function tagEnd (text: string, start: number): number {
  let quote = ''
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === quote) {
        quote = ''
      }
    } else if (char === '"' || char === '\'') {
      quote = char
    } else if (char === '>') {
      return index + 1
    }
  }
  return text.length
}

// One line per button: the kept attributes (sorted, whitespace collapsed) and the i18n keys of its content.
export function buttonWiring (text: string): string[] {
  const template = templateOf(text)
  return [...template.matchAll(BUTTON)].map(match => {
    const start = match.index
    const end = tagEnd(template, start)
    const open = template.slice(start + match[0].length, end).replace(/\/?>$/, '')
    const attributes = [...open.matchAll(ATTRIBUTE)]
      .filter(attribute => KEPT.test(attribute[1]!))
      .map(attribute => (attribute[2] === undefined ? attribute[1]! : `${attribute[1]}="${attribute[2].replaceAll(/\s+/g, ' ').trim()}"`))
      .toSorted()
    const selfClosing = template.slice(start, end).endsWith('/>')
    const close = selfClosing ? end : template.indexOf(`</${match[1]}>`, end)
    const content = selfClosing ? '' : template.slice(end, close === -1 ? end : close)
    const keys = [...content.matchAll(I18N_KEY)].map(key => key[1]!)
    return keys.length > 0 ? `${attributes.join(' ')} | ${keys.join(', ')}` : attributes.join(' ')
  })
}

describe('button consumers keep their wiring (kit-button-rest)', () => {
  it('reads the buttons of a template', () => {
    const sample = '<template>\n  <!-- <v-btn @click="no" /> -->\n  <v-btn\n    color="primary"\n    data-testid="go"\n    @click="a > b"\n  >\n    {{ t(\'button.go\') }}\n  </v-btn>\n  <AppButton kind="primary" :disabled="x" />\n</template>'
    expect(buttonWiring(sample)).toEqual(['@click="a > b" data-testid="go" | button.go', ':disabled="x"'])
  })

  it.each(FILES)('%s', file => {
    expect(buttonWiring(readFileSync(join(ROOT, file), 'utf8'))).toMatchSnapshot()
  })
})
