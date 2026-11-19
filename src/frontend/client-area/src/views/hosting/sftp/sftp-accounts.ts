import type { Translate } from '@/views/hosting/ftp/ftp-accounts'
import type { HostingService } from '@/views/hosting/hosting.types'
import type { SftpAccount } from './sftp.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** A list row: the API item plus the fields the page computes while mapping the response. */
export interface SftpRow extends SftpAccount {
  updated_at_text: string
  infoButtonLoading: boolean
  actions: string[]
}

/** Legacy headers: SFTP has no directory or usage column, unlike FTP. */
export const sftpHeaders: LegacySortHeader[] = [
  { text: 'user', value: 'user', sortable: true },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

/** The map: every row takes the account's `meta.actions`, `updated_at_text` is relative time or `-`. */
export function toSftpRow (account: SftpAccount, actions: string[], fromNow: (date: string) => string): SftpRow {
  return {
    ...account,
    updated_at_text: account.updated_at ? fromNow(account.updated_at) : '-',
    infoButtonLoading: false,
    actions,
  }
}

export interface SftpMenuAction {
  id: 'disconnect' | 'access'
  title: string
  icon: string
  iconSize: string
}

/** "Disconnect all" always, "Manage SSH access" only when the plan lets the user enable SSH. */
export function sftpMenuActions (t: Translate, service: HostingService, variant: 'hosting' | 'project' = 'hosting'): SftpMenuAction[] {
  const actions: SftpMenuAction[] = [
    { id: 'disconnect', title: t('button.disconnect.all'), icon: '$logout', iconSize: '20' },
  ]
  // In a project the menu is only "Disconnect all", `plan_settings` is not read.
  if (variant === 'project') {
    return actions
  }
  if (service.plan_settings.allow_user_enable_ssh_access) {
    actions.push({ id: 'access', title: t('button.manageSshAccess'), icon: '$settings', iconSize: '20' })
  }
  return actions
}
