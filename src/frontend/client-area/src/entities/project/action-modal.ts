import type { ActionModal as KitActionModal, Translate } from '@/shared/ui/modal/action-modal'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'

// The legacy mixin kept one mutable `modalOptions` bag that `BasicModal` read; here every builder returns
// the kit `BasicModal` props (`props`), the fields its default slot renders (`fields`) and the width the view sets on the card.
// The API calls and the alerts stay with the caller (`MassActionDeps`), so the builders and the runners are plain functions.

// `clear-cache`, `update`, `copy`, `copy-options`, `push-loading`, `push` and `push-staging` are single actions (`@/entities/project/instance-row-actions`);
// `push-staging` is the push to the staging copy (the same loading state as push to live, its own form). A single delete reuses `mass-delete` with one item.
// `install-woocommerce` is the General screen's WooCommerce install (`@/entities/project/instance-woocommerce`).
// `backup-restore` and `backup-delete` are the Backups screen's row actions (`@/views/projects/project/backups/backup-actions`).
// `git-disconnect`, `git-branch`, `git-token`, `git-pull-dirty` and `git-push-first` are the Git page's dialogs (`@/views/projects/project/advanced/git/git-actions`).
// `theme-*` are the Themes page's dialogs (`@/views/projects/project/advanced/themes/theme-actions`).
export type ProjectModalType
  = 'mass-clear-cache' | 'mass-delete' | 'suspend' | 'clear-cache' | 'update' | 'copy' | 'copy-options' | 'push-loading' | 'push' | 'push-staging' | 'install-woocommerce'
    | 'plugin-activate' | 'plugin-deactivate' | 'plugin-update' | 'plugin-delete' | 'plugin-install' | 'plugin-mass-activate' | 'plugin-mass-deactivate' | 'plugin-mass-update' | 'plugin-mass-delete'
    | 'theme-install' | 'theme-activate' | 'theme-update' | 'theme-delete' | 'theme-mass-update' | 'theme-mass-delete'
    | 'backup-restore' | 'backup-delete' | 'backup-mass-delete' | 'backup-download' | 'git-disconnect' | 'git-branch' | 'git-token' | 'git-pull-dirty' | 'git-push-first'
    | 'git-deploy-key-delete' | 'git-deploy-key-rotate'
  // `wordpress-mcp-disable` is the WordPress MCP page's disable confirmation (`@/views/projects/project/advanced/wordpress-mcp/wordpress-mcp-modal`).
    | 'wordpress-mcp-disable'

export type ActionModal = KitActionModal<ProjectModalType>

export const SUSPEND_MODAL_WIDTH = '360px'

export function buildMassDeleteModal (
  items: ReadonlyArray<{ id: number, hostingServerType?: string, type?: string }>,
  t: Translate,
): ActionModal {
  const count = items.length
  const wpCloudCount = items.filter(item => item.hostingServerType === 'wp-cloud').length

  // The delete always removes the files and the databases (the Engine has no keep option), so both are required
  // acknowledgements of what is lost, whatever the project type.
  const fields: ModalField[] = [
    { label: t(count === 1 ? 'form.confirmDelete.instanceFiles_one' : 'form.confirmDelete.instanceFiles_other'), name: 'remove_data', type: 'checkbox', required: true },
    { label: t(count === 1 ? 'form.confirmDelete.instanceDatabase_one' : 'form.confirmDelete.instanceDatabase_other'), name: 'remove_database', type: 'checkbox', required: true },
    {
      message: `<b>${t('message.confirmAction')}</b>`,
      label: t('form.confirmDelete.instance', { count: 1 }),
      name: 'confirm',
      type: 'checkbox',
      required: true,
    },
  ]

  return {
    type: 'mass-delete',
    props: {
      title: t('heading.instance.delete.title', { count }),
      message: t('heading.instance.delete.message', { count }),
      icon: '$alertwarning',
      color: 'error',
      ...(wpCloudCount > 0 ? { alert: t('heading.instance.delete.wpCloud.alert') } : {}),
      buttons: [{ id: 'submit', label: t('button.deleteInstance', { count }), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields,
    width: MODAL_WIDTH,
    persistent: false,
  }
}

export interface MassActionDeps {
  clearInstanceCache: (id: number) => Promise<unknown>
  deleteInstance: (id: number, body: Record<string, unknown>) => Promise<unknown>
  /** Refresh `/home` (instance counts, services). Fire and forget. */
  refreshHome: () => Promise<unknown>
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
  t: Translate
}

export type MassDeleteOutcome = 'deleted' | 'error'

/**
 * The DELETE body: deleting a project always removes its files and databases, so both acknowledgements go to the request
 * as `true` (the dialog submits only when every box is ticked).
 */
export function deleteBody (values: Record<string, unknown>): Record<string, unknown> {
  return { ...values, remove_data: true, remove_database: true, confirm: true }
}

/**
 * All DELETEs in parallel with the dialog values as the body
 * (`remove_data`, `remove_database`, `confirm`, all `true`). A rejection with status 404 counts as success, anything else
 * shows the error and keeps the dialog open.
 */
export async function runMassDelete (
  items: ReadonlyArray<{ id: number }>,
  values: Record<string, unknown>,
  deps: MassActionDeps,
): Promise<MassDeleteOutcome> {
  const success = () => {
    void deps.refreshHome().catch(() => undefined)
    deps.addSuccessAlert(deps.t('notification.instance.modal.delete.success', { count: items.length }))
    return 'deleted' as const
  }

  const body = deleteBody(values)

  try {
    await Promise.all(items.map(item => deps.deleteInstance(item.id, body)))
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) {
      return success()
    }
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  return success()
}
