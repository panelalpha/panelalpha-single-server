import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { hubLoginDestination as readHubLoginDestination } from './hub-login-exchange'
import { runSessionClearedHandlers } from './session-reset'
import {
  getHomeCached,
  type HomeResponse,
  type HomeUser,
  isLoginIntermediate,
  isRegisterIntermediate,
  login as loginRequest,
  type LoginRequest,
  type LoginResponse,
  logout as logoutRequest,
  postHubLogin,
  postSocialCallback,
  postSsoLogin,
  register as registerRequest,
  type RegisterRequest,
  type RegisterResponse,
  resendVerificationCode as resendVerificationCodeRequest,
  submitTwoFactorChallenge,
  type TwoFactorChallengeRequest,
  verifyEmailCode as verifyEmailCodeRequest,
} from './session.api'
import {
  clearLoggedInFlag,
  isLoggedInGate,
  setLoggedInFlag,
} from './session.gate'

export const useSessionStore = defineStore('session', () => {
  const home = ref<HomeResponse | null>(null)
  const gateVersion = ref(0)
  // One SSO exchange per page load, like legacy; not reactive on purpose.
  let ssoExchangeStarted = false
  // One hub exchange per page load, like legacy; read by the router guard.
  const hubExchangeStarted = ref(false)
  // Read by the /hub-login screen.
  const hubLoginFailed = ref(false)
  // The project page a ticket for one app lands on (the Hub's "Open in panel"); null is the dashboard.
  const hubLoginDestination = ref<string | null>(null)

  const user = computed(() => home.value?.user ?? null)
  const services = computed(() => home.value?.user?.services ?? [])
  const isLoggedIn = computed(() => {
    void gateVersion.value
    return isLoggedInGate()
  })

  function bumpGate () {
    gateVersion.value += 1
  }

  function hydrateHome (data: HomeResponse) {
    home.value = data
  }

  /** Merges a change into the cached `/home` user (account saves keep the shell in sync without a refetch). */
  function patchUser (patch: Partial<HomeUser>) {
    if (home.value?.user) {
      home.value = { ...home.value, user: { ...home.value.user, ...patch } }
    }
  }

  function markLoggedIn () {
    setLoggedInFlag()
    bumpGate()
  }

  function clearSession () {
    clearLoggedInFlag()
    home.value = null
    // Module-level caches of the signed-in user's data (e.g. the SSL certificates of an entity) register in `session-reset.ts`.
    runSessionClearedHandlers()
    clearAllCachedGet()
    bumpGate()
  }

  /**
   * The shortcut skips the request while `/home` is loaded, otherwise the cached `/home`
   * (`Api.cached`) is read, and `force` asks for a fresh one.
   */
  async function ensureHome (force = false): Promise<HomeResponse> {
    if (!force && home.value?.app) {
      return home.value
    }

    const data = await getHomeCached(force ? 0 : undefined)
    hydrateHome(data)
    return data
  }

  /**
   * The cached `/home`, and only its
   * `user.services` replaces the loaded one, so `patchUser` edits survive.
   */
  async function refreshServices (): Promise<void> {
    const data = await getHomeCached()

    if (home.value?.user) {
      home.value = { ...home.value, user: { ...home.value.user, services: data.user?.services } }
    } else {
      hydrateHome(data)
    }
  }

  async function login (payload: LoginRequest): Promise<LoginResponse> {
    const data = await loginRequest(payload)

    if (!isLoginIntermediate(data) && data.app) {
      hydrateHome(data as HomeResponse)
      clearAllCachedGet()
      markLoggedIn()
    }

    return data
  }

  async function register (
    payload: RegisterRequest,
    options?: { defaultLanguage?: string | null },
  ): Promise<RegisterResponse> {
    const data = await registerRequest(payload, options)

    if (!isRegisterIntermediate(data) && data.app) {
      hydrateHome(data as HomeResponse)
      clearAllCachedGet()
      markLoggedIn()
    }

    return data
  }

  async function completeTwoFactor (
    payload: TwoFactorChallengeRequest,
  ): Promise<HomeResponse> {
    await submitTwoFactorChallenge(payload)
    const data = await getHomeCached(0)
    hydrateHome(data)
    clearAllCachedGet()
    markLoggedIn()
    return data
  }

  async function verifyEmailCode (code: string): Promise<LoginResponse> {
    const data = await verifyEmailCodeRequest(code)

    if (!isLoginIntermediate(data) && data.app) {
      hydrateHome(data as HomeResponse)
      clearAllCachedGet()
      markLoggedIn()
    }

    return data
  }

  async function resendVerificationCode (): Promise<void> {
    await resendVerificationCodeRequest()
  }

  async function socialLogin (
    provider: string,
    search?: string,
  ): Promise<HomeResponse> {
    const data = await postSocialCallback(
      provider,
      search ?? (typeof window === 'undefined' ? '' : window.location.search),
    )

    if (data?.user) {
      hydrateHome(data)
      clearAllCachedGet()
      markLoggedIn()
    }

    return data
  }

  /**
   * On /sso-login, the first call exchanges the token (flag set before the POST, also when it
   * fails), then marks the session and forces GET /home (`ensureHome(true)`, which stores it in the `Api.cached` port).
   * Later calls skip the POST and reuse the loaded /home (`ensureHome()`), so Back onto a used token redirects instead
   * of re-sending it. This flow does not clear the cache.
   */
  async function ssoLogin (token: string | null): Promise<HomeResponse> {
    if (ssoExchangeStarted) {
      return ensureHome()
    }

    ssoExchangeStarted = true
    await postSsoLogin(token)
    markLoggedIn()
    return ensureHome(true)
  }

  /**
   * On /hub-login, the flag is set before the first await, a missing ticket fails without a
   * request, and any rejection is swallowed into `hubLoginFailed`. No cache clear, no `/home` from the POST.
   */
  async function hubLogin (ticket: string | null): Promise<void> {
    hubExchangeStarted.value = true

    if (!ticket) {
      hubLoginFailed.value = true
      return
    }

    try {
      hubLoginDestination.value = readHubLoginDestination(await postHubLogin(ticket))
      markLoggedIn()
    } catch {
      hubLoginFailed.value = true
    }
  }

  async function logout (): Promise<void> {
    try {
      await logoutRequest()
    } finally {
      clearSession()
    }
  }

  // `/home` loaded by the router guard in the navigation that is still running (cold start). The `beforeEnter` of the session
  // screens asks for a fresh one; this is it, so the first `remoteAuthCheck` of that navigation reuses it.
  let bootHomeInNavigation = false

  /** The router sets it after its boot `GET /home` and clears it when the navigation ends (`afterEach`). */
  function markBootHome (fresh: boolean): void {
    bootHomeInNavigation = fresh
  }

  async function remoteAuthCheck (): Promise<boolean> {
    try {
      const reuse = bootHomeInNavigation && home.value?.app ? home.value : null
      bootHomeInNavigation = false
      const data = reuse ?? await getHomeCached(0)
      hydrateHome(data)

      if (data.user) {
        markLoggedIn()
        return true
      }

      clearLoggedInFlag()
      bumpGate()
      return false
    } catch {
      clearLoggedInFlag()
      bumpGate()
      return false
    }
  }

  return {
    home,
    user,
    services,
    isLoggedIn,
    hydrateHome,
    patchUser,
    markLoggedIn,
    clearSession,
    ensureHome,
    refreshServices,
    login,
    register,
    completeTwoFactor,
    verifyEmailCode,
    resendVerificationCode,
    socialLogin,
    ssoLogin,
    hubExchangeStarted,
    hubLoginFailed,
    hubLoginDestination,
    hubLogin,
    logout,
    remoteAuthCheck,
    markBootHome,
  }
})
