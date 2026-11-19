import type { InstalledInstancePayload } from './installation-events'
import type { OnboardingService } from './onboarding-service'

// After the install of a simple
// service the user goes to the WP admin by SSO: as soon as the SSL certificate and the domain resolve, or once the delay of the service
// runs out, whatever the last check said.

/** The interval between the checks. */
export const SUPER_QUICK_CHECK_INTERVAL_MS = 5000
/** The delay before the redirect that follows an expired delay. */
export const SUPER_QUICK_EXPIRED_REDIRECT_MS = 100

export interface SuperQuickRedirectDeps {
  /** Resolves false on any error (legacy logs it and carries on). */
  isSslCertificateDetected: (domain: string) => Promise<boolean>
  /** Resolves false on any error. */
  isDomainResolved: (serviceId: number | string, domain: string) => Promise<boolean>
  /** The SSO link of the instance for the single user (`createSsoUrl(id, 1)`). */
  requestSsoUrl: (instanceId: number) => Promise<string>
  /** Goes to the url. */
  navigate: (url: string) => void
  /** The SSO request failed: the start-creating offer and the alert. */
  onSsoFailed: (error: unknown) => void
  /** The SSO request is over: the progress shows its result. */
  onSsoSettled: () => void
  /** The run guard: false once the progress closed or the flow started again. Polling and redirect stop then. */
  isActive: () => boolean
}

export interface SuperQuickRedirect {
  start: () => Promise<void>
  stop: () => void
}

/**
 * The first check runs at once, then the checks go on every interval until the flags are both set or
 * the delay of the service has run out. The SSL and the resolve flags latch once they were seen. The redirect runs
 * at most once.
 */
export function createSuperQuickRedirect (deps: SuperQuickRedirectDeps, target: { instance: InstalledInstancePayload, service: OnboardingService }): SuperQuickRedirect {
  const { instance, service } = target
  const domain = instance.domain ?? ''
  const serviceId = instance.service_id ?? service.id
  let sslDetected = false
  let domainResolved = false
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let redirected = false
  let checking = false

  const active = (): boolean => !stopped && deps.isActive()

  function stopPolling (): void {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  /** The SSL check first, then the resolve check, each only while its flag is not set. */
  async function prerequisitesReady (): Promise<boolean> {
    if (!sslDetected) {
      sslDetected = await deps.isSslCertificateDetected(domain).catch(() => false)
    }
    if (!domainResolved) {
      domainResolved = await deps.isDomainResolved(serviceId, domain).catch(() => false)
    }
    return sslDetected && domainResolved
  }

  /** The link is requested and the browser goes there; a failure offers the start-creating button. */
  async function redirect (): Promise<void> {
    if (redirected || !active()) {
      return
    }
    redirected = true
    try {
      deps.navigate(await deps.requestSsoUrl(instance.id))
    } catch (error) {
      deps.onSsoFailed(error)
    } finally {
      deps.onSsoSettled()
    }
  }

  /** One interval tick. */
  async function tick (startTime: number, totalTimeout: number): Promise<void> {
    if (!active()) {
      stopPolling()
      return
    }
    if (Date.now() - startTime >= totalTimeout) {
      stopPolling()
      if (await prerequisitesReady()) {
        await redirect()
        return
      }
      // The delay ran out: the redirect goes on whatever the last check said.
      setTimeout(() => {
        void redirect()
      }, SUPER_QUICK_EXPIRED_REDIRECT_MS)
      return
    }
    // Both checks can take longer than the interval: a tick while they still run is skipped, so the requests do not pile up
    // (legacy has no such guard). The expiry above still runs on time.
    if (checking) {
      return
    }
    checking = true
    let ready: boolean
    try {
      ready = await prerequisitesReady()
    } finally {
      checking = false
    }
    if (ready) {
      stopPolling()
      await redirect()
    }
  }

  async function start (): Promise<void> {
    // A service with id 0 never starts.
    if (service.id === 0 || !active()) {
      return
    }
    if (await prerequisitesReady()) {
      await redirect()
      return
    }
    if (!active()) {
      return
    }
    const totalTimeout = (service.onboarding?.super_quick_redirect_delay_after_site_creation ?? Infinity) * 1000
    const startTime = Date.now()
    timer = setInterval(() => {
      void tick(startTime, totalTimeout)
    }, SUPER_QUICK_CHECK_INTERVAL_MS)
  }

  function stop (): void {
    stopped = true
    stopPolling()
  }

  return { start, stop }
}

/** The simple mode with the redirect action. */
export function redirectsToWpAdmin (service: OnboardingService | undefined): boolean {
  const mode = service?.onboarding_mode
    || (service?.install_method === 'simple' || service?.install_method === 'super_quick' ? 'simple' : null)
  return mode === 'simple' && service?.onboarding?.super_quick_post_installation_action === 'redirect'
}

/** Every action but the redirect shows the dashboard and the result buttons. */
export function displaysButtons (service: OnboardingService | undefined): boolean {
  return service?.onboarding?.super_quick_post_installation_action !== 'redirect'
}

/** The builder wording of the in-progress info. */
export function hasExternalWordPressBuilder (instance: InstalledInstancePayload | null): boolean {
  const onboarding = instance?.plan_settings?.onboarding as { has_external_wordpress_builder?: unknown } | null | undefined
  return Boolean(onboarding?.has_external_wordpress_builder)
}
