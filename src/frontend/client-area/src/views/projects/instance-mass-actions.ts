import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import { SUSPEND_MODAL_WIDTH } from '@/entities/project/action-modal'
import { cancelButton } from '@/shared/ui/modal/action-modal'

// The list-only action: unsuspend. The shared builders and runners
// (the mass delete, the cancel buttons, the modal types) live in `@/entities/project/action-modal`, which the row actions use too.

/** The unsuspend dialog: persistent from the start, 360px wide. */
export function buildUnsuspendModal (t: Translate): ActionModal {
  return {
    type: 'suspend',
    props: {
      title: t('heading.instance.unsuspend.title'),
      message: t('heading.instance.unsuspend.message'),
      icon: '$suspended',
      color: 'sand',
      buttons: [{ id: 'submit', label: t('button.unsuspend'), color: 'sand-darken-1' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: SUSPEND_MODAL_WIDTH,
    persistent: true,
  }
}

/**
 * Opens the link in a new tab and leaves the dialog open. When the user has no
 * `service_unsuspend_link` the url is `true`, which legacy passed to `window.open` as is.
 */
export function unsuspendInstance (url: string | true, open: (url: string, target: string) => unknown = window.open.bind(window)): void {
  open(url as string, '_blank')
}
