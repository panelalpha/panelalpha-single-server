import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'

// The two confirmation dialogs of the deploy key card (delete and rotate). Pure builders;
// the view opens them and the composable (`use-git-deploy-key.ts`) runs the requests.

/** The red warning dialog with the delete button and the cancel button. */
export function buildDeleteKeyModal (t: Translate): ActionModal {
  return {
    type: 'git-deploy-key-delete',
    props: {
      title: t('heading.onboarding.gitDeploy.auth.deployKey.deleteTitle'),
      message: t('heading.onboarding.gitDeploy.auth.deployKey.deleteWarning'),
      icon: '$alertwarning',
      color: 'error',
      buttons: [
        { id: 'submit', label: t('button.onboarding.gitDeploy.deleteDeployKey'), color: 'error' },
        cancelButton(t),
      ],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** The red warning dialog that generates a new key (DELETE, then POST) on confirm. */
export function buildRotateKeyModal (t: Translate): ActionModal {
  return {
    type: 'git-deploy-key-rotate',
    props: {
      title: t('heading.onboarding.gitDeploy.auth.deployKey.regenerateTitle'),
      message: t('heading.onboarding.gitDeploy.auth.deployKey.regenerateWarning'),
      icon: '$alertwarning',
      color: 'error',
      buttons: [
        { id: 'submit', label: t('button.onboarding.gitDeploy.regenerateDeployKey'), color: 'error' },
        cancelButton(t),
      ],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * Error text of the key requests: the first `errors.repo_url` message of the response,
 * else the general message of the error.
 */
export function deployKeyErrorMessage (error: unknown, getErrorMessage: (error: unknown) => string): string {
  const repoUrl = (error as { response?: { data?: { errors?: { repo_url?: unknown } | null } | null } } | null | undefined)
    ?.response
    ?.data
    ?.errors
    ?.repo_url
  const first = Array.isArray(repoUrl) ? repoUrl[0] : undefined
  return typeof first === 'string' && first ? first : getErrorMessage(error)
}
