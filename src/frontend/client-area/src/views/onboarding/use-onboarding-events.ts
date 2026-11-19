import type { InstallationEventDeps, InstalledInstancePayload } from './installation-events'
import type { OnboardingService } from './onboarding-service'
import type { SuperQuickRedirect, SuperQuickRedirectDeps } from './super-quick'
import type { EntityPayload } from '@/shared/events/app-events'
import { watch } from 'vue'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { createSsoUrl } from '@/entities/project/instance-actions.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { emit as emitAppEvent, useAppEvent } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { handleAfterLogin } from './after-login'
import { applyInstallationFailed, applyInstallationFinished, applySyncFailed, applySyncFinished, hasInstanceId, PROGRESS_STEPS, sameInstanceId } from './installation-events'
import { useOnboardingFlow } from './onboarding-flow'
import { getDomainResolved, getSslCertificateDetected } from './onboarding.api'
import { useOnboardingStore } from './onboarding.store'
import { createSuperQuickRedirect } from './super-quick'

/**
 * Listeners of the onboarding entry points, registered once from `App.vue` setup so they survive the `appKey` remount
 * of `v-app` (same as `useRetryInstall`).
 */
export function useOnboardingEvents (): void {
  const flow = useOnboardingFlow()
  const onboarding = useOnboardingStore()
  const session = useSessionStore()

  useAppEvent('start-installation-process', () => flow.start())

  // A valid files drop on the project list starts the files sequence.
  useAppEvent('start-files-drop-install', payload => {
    void flow.startFromFilesDrop(payload)
  })

  // Try again of a standard or advanced install: the standard form opens in retry mode.
  useAppEvent('instance-retry-install-with-form', instance => {
    if (instance) {
      flow.openRetryForm(instance)
    }
  })

  useAppEvent('after-login', () => {
    handleAfterLogin({
      origin: window.location.origin,
      storage: readLocalStorage(),
      services: session.services as OnboardingService[],
      startInstallation: () => emitAppEvent('start-installation-process'),
      creationTypeSelected: (creationType, options) => flow.creationTypeSelected(creationType, options),
      startSync: () => flow.startSync(),
    })
  })

  // The super-quick polling of the running flow. A closed or restarted flow stops it at once (the run guard also stops it on each tick).
  let superQuick: SuperQuickRedirect | null = null
  watch(() => onboarding.run, () => {
    superQuick?.stop()
    superQuick = null
  })

  /** The SSO redirect, bound to the flow it started in (`run`). */
  function startSuperQuickRedirect (instance: InstalledInstancePayload, service: OnboardingService): void {
    superQuick?.stop()
    const run = onboarding.run
    superQuick = createSuperQuickRedirect(superQuickDeps(run), { instance, service })
    void superQuick.start()
  }

  function superQuickDeps (run: number): SuperQuickRedirectDeps {
    return {
      isSslCertificateDetected: getSslCertificateDetected,
      isDomainResolved: getDomainResolved,
      requestSsoUrl: async instanceId => (await createSsoUrl(instanceId, 1)).sso_url,
      navigate: url => {
        window.location.href = url
      },
      onSsoFailed: error => {
        onboarding.showStartCreatingButton = true
        useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      },
      onSsoSettled: () => {
        onboarding.installationCompleted = true
        onboarding.installationError = false
      },
      isActive: () => onboarding.run === run && onboarding.step !== null && PROGRESS_STEPS.has(onboarding.step),
    }
  }

  // Echo results of the install. The progress reads the result from the store.
  const installationDeps: InstallationEventDeps = {
    progressOpen: () => onboarding.step !== null && PROGRESS_STEPS.has(onboarding.step),
    run: () => onboarding.run,
    currentInstanceId: () => onboarding.newInstance?.id,
    setInstalledInstance: instance => {
      onboarding.newInstance = instance as unknown as Record<string, unknown>
    },
    verifyDnsResolving: input => verifyDomainResolving(input),
    setDnsMismatch: mismatch => {
      onboarding.dnsMismatch = mismatch
    },
    setResult: ({ completed, error }) => {
      onboarding.installationCompleted = completed
      onboarding.installationError = error
    },
    service: () => onboarding.selectedService ?? undefined,
    startSuperQuickRedirect,
    setShowStartCreatingButton: show => {
      onboarding.showStartCreatingButton = show
    },
  }

  // An event that comes before the install request answered (no `newInstance` id yet) cannot be matched to a project. It is kept and
  // looked at again when the id is set, so a very fast install still ends the progress. Events of other projects are dropped then.
  const MAX_EARLY_EVENTS = 20
  let earlyEvents: Array<{ failed: boolean, payload: NonNullable<EntityPayload> }> = []

  function hasNoInstanceYet (): boolean {
    return !hasInstanceId(onboarding.newInstance?.id)
  }

  function handleInstallationEvent (failed: boolean, payload: EntityPayload | null): void {
    if (payload && hasNoInstanceYet() && hasInstanceId(payload.id)) {
      earlyEvents = [...earlyEvents, { failed, payload }].slice(-MAX_EARLY_EVENTS)
      return
    }
    if (failed) {
      applyInstallationFailed(payload, installationDeps)
    } else {
      void applyInstallationFinished(payload, installationDeps)
    }
  }

  watch(() => onboarding.newInstance?.id, id => {
    if (!hasInstanceId(id) || earlyEvents.length === 0) {
      return
    }
    const events = earlyEvents
    earlyEvents = []
    for (const event of events) {
      if (sameInstanceId(event.payload.id, id)) {
        handleInstallationEvent(event.failed, event.payload)
      }
    }
  })
  // A closed or restarted flow forgets the events kept for the previous one.
  watch(() => onboarding.run, () => {
    earlyEvents = []
  })

  useAppEvent('instance-installation-finished', payload => {
    handleInstallationEvent(false, payload ?? null)
  })
  useAppEvent('instance-installation-failed', payload => {
    handleInstallationEvent(true, payload ?? null)
  })

  // Echo results of the sync: the same result flags as the install.
  useAppEvent('service-sync-hosting-account-finished', () => {
    applySyncFinished(installationDeps)
  })
  useAppEvent('service-sync-hosting-account-failed', () => {
    applySyncFailed(installationDeps)
  })
}

/** Storage access can throw when the browser blocks site data; the sign-in then simply opens no onboarding. */
function readLocalStorage (): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}
