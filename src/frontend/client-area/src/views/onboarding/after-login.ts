import type { OnboardingService } from './onboarding-service'
import type { OnboardingSource } from './onboarding-steps'
import { clearControlPanelUpgradeToken } from '@/shared/session/control-panel-upgrade-token'
import { redirectStorageKey } from '@/shared/session/login-storage-keys'
import { getActiveServices, hasLimitReached } from './onboarding-service'

export type AfterLoginRedirect = 'new-site' | 'new-import' | 'control-panel-upgrade'

/** `force-install`: no `-redirect` key, but an active service with `force_install` and no instance yet. */
export type AfterLoginResult = AfterLoginRedirect | 'force-install'

export interface AfterLoginDeps {
  /** `window.location.origin`: the `-redirect` and `-token` keys are prefixed with it. */
  origin: string
  /** `null` when the browser blocks storage; the handler then does nothing. */
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null
  services: readonly OnboardingService[]
  /** Sent before the flow picks its step. */
  startInstallation: () => void
  /** 0 = Create, 1 = Import. */
  creationTypeSelected: (creationType: 0 | 1, options?: { source?: OnboardingSource }) => void
  /** The sync progress for `control-panel-upgrade`. */
  startSync: () => void
}

/**
 * The `after-login` listener. A `-redirect` key left by the register or
 * quick-register page opens the onboarding on its path, but only while an active service still has room. The key is removed
 * on every path, also when the storage throws. Returns the redirect that was acted on, or null.
 *
 * Without a `-redirect` key (null or empty) the forced install applies: an active service with `force_install` and `instance_count === 0` opens Create. An unknown non-empty value
 * blocks it, as in legacy.
 */
export function handleAfterLogin (deps: AfterLoginDeps): AfterLoginResult | null {
  const { storage } = deps
  if (!storage) {
    return null
  }

  const redirectKey = redirectStorageKey(deps.origin)
  try {
    const redirect = storage.getItem(redirectKey)
    if (!redirect) {
      if (hasLimitReached(deps.services) || !shouldForceInstallAfterLogin(deps.services)) {
        return null
      }
      deps.startInstallation()
      deps.creationTypeSelected(0, { source: 'after-login' })
      return 'force-install'
    }

    if (!isAfterLoginRedirect(redirect) || hasLimitReached(deps.services)) {
      return null
    }

    if (redirect === 'new-site') {
      deps.startInstallation()
      deps.creationTypeSelected(0, { source: 'after-login' })
    } else if (redirect === 'new-import') {
      deps.startInstallation()
      deps.creationTypeSelected(1)
    } else {
      deps.startInstallation()
      // The token of the upgrade lives in `sessionStorage`; the hand-over is done, so it goes now (also a legacy `localStorage` copy).
      clearControlPanelUpgradeToken({ legacy: deps.storage, origin: deps.origin })
      deps.startSync()
    }
    return redirect
  } finally {
    storage.removeItem(redirectKey)
  }
}

/** An active service that forces the install and has no instance yet. */
function shouldForceInstallAfterLogin (services: readonly OnboardingService[]): boolean {
  return getActiveServices(services).some(service => service.force_install === true && service.instance_count === 0)
}

const AFTER_LOGIN_REDIRECTS = new Set<string>(['new-site', 'new-import', 'control-panel-upgrade'])

function isAfterLoginRedirect (value: string | null): value is AfterLoginRedirect {
  return value !== null && AFTER_LOGIN_REDIRECTS.has(value)
}
