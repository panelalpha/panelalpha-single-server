import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'

// The warning dialog that confirms the disable.
// The confirm button comes first and the cancel button after it, as legacy `unshift` put it. The dialog is persistent: outside clicks do nothing.

/** Builds the disable confirmation. The copy and the warning look come from the legacy page. */
export function buildDisableMcpModal (t: Translate): ActionModal {
  return {
    type: 'wordpress-mcp-disable',
    props: {
      title: t('heading.instance.advanced.wordpressMcp.disableConfirmTitle'),
      message: t('heading.instance.advanced.wordpressMcp.disableConfirmBody'),
      icon: '$alertwarning',
      color: 'warning',
      buttons: [
        { id: 'submit', label: t('heading.instance.advanced.wordpressMcp.confirm'), color: 'warning' },
        cancelButton(t),
      ],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: true,
  }
}
