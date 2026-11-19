import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'

// WooCommerce install and update of the General screen (Installation card). The install is a dialog of the instance frame
// (`ActionModal`, `install-woocommerce`); the update has its own dialog (`WoocommerceUpdateModal`) and only its runner lives here.

export interface WoocommerceDeps {
  installWoocommerce: (id: number) => Promise<unknown>
  updateWoocommerce: (id: number) => Promise<unknown>
  /** The install is queued: the card shows it until the job's notification. */
  setInstalling?: (installing: boolean) => void
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
  t: Translate
}

/**
 * The title and message, then the install button before the
 * cancel button. The icon is left empty, so the dialog has none.
 */
export function buildInstallWoocommerceModal (t: Translate): ActionModal {
  return {
    type: 'install-woocommerce',
    props: {
      title: t('heading.instance.woocommerce.title'),
      message: t('heading.instance.woocommerce.message'),
      icon: '',
      buttons: [
        { id: 'submit', label: t('button.install'), color: 'primary' },
        { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', customClass: 'cancel-btn' },
      ],
      confirmRequired: false,
    },
    fields: [],
    width: '560px',
    persistent: false,
  }
}

/**
 * `installWoocommerce`: one POST with no body. Success alerts and the caller closes the dialog;
 * an error alerts and the dialog stays open. The accept says the queued install started; a failed job alerts from the frame.
 */
export async function runInstallWoocommerce (instance: { id: number }, deps: WoocommerceDeps): Promise<'success' | 'error'> {
  deps.setInstalling?.(true)
  try {
    await deps.installWoocommerce(instance.id)
  } catch (error) {
    deps.setInstalling?.(false)
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.plugin.install.success'))
  return 'success'
}

/**
 * The update of WooCommerce from the Installation card:
 * one PUT with no body. Success alerts and the caller closes the dialog; an error alerts and the dialog stays open.
 */
export async function runWoocommerceUpdate (instance: { id: number }, deps: WoocommerceDeps): Promise<'success' | 'error'> {
  try {
    await deps.updateWoocommerce(instance.id)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.plugin.update.success', { count: 1 }))
  return 'success'
}
