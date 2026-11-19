import type { BrandColors } from '@/shared/theme/brand-theme'
import type { LocationQueryValue } from 'vue-router'
import i18next from 'i18next'
import { cachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { clearControlPanelUpgradeToken, readControlPanelUpgradeToken } from './control-panel-upgrade-token'
import { getXsrfToken } from './session.gate'

export interface LoginRequest {
  'email': string
  'password'?: string | null
  'remember'?: boolean | null
  'g-recaptcha-response'?: string
}

export interface TwoFactorChallengeRequest {
  code?: string
  recovery_code?: string
}

export interface HomeService {
  [key: string]: unknown
  id: number
}

export interface HomeUser {
  [key: string]: unknown
  email?: string
  name?: string
  gravatar_hash?: string
  language?: string
  services?: HomeService[]
  has_hosting_access?: boolean
  reseller_settings?: unknown
  is_ss_default?: boolean
  /** The Community panel generated the password for the user (no current password to confirm). */
  password_generated?: boolean
  password_change_required?: boolean
  two_factor_auth_required?: boolean
  two_factor_auth_enabled?: boolean
  /** `home.user.order_domain_link`: the link under the domain field, shown only when set. */
  order_domain_link?: string | null
}

export interface HomeThemeStyle {
  [key: string]: unknown
  darkMode?: boolean
  disableShadows?: boolean
  allowToChangeMode?: boolean
}

export interface HomeTheme {
  [key: string]: unknown
  logo?: string | false | null
  darkLogo?: string | false | null
  favicon?: string | false | null
  title?: string
  colors?: Partial<BrandColors>
  style?: HomeThemeStyle
}

export interface HomeIntegrations {
  [key: string]: unknown
  auth?: string[]
  /** The analytics cards and the Monitoring tab. */
  report_provider_enabled?: boolean
}

export interface HomeApp {
  [key: string]: unknown
  name?: string
  theme?: HomeTheme
  /** What Restore Default in the Style Manager writes back. */
  default_theme?: HomeTheme
  recaptcha_site_key?: string | null
  default_language?: string
  support_link?: string
  billing_enabled?: boolean
  custom_css?: string | null
  custom_js_header?: string | null
  custom_js_footer?: string | null
  registration_enabled?: boolean
  registration_tos?: string
  from_control_panel_registration?: {
    [key: string]: unknown
    tos?: string
  }
  languages?: string[]
  language_flags?: Record<string, string>
  /** The Site details / Loading speed cards show on it (or single server). */
  page_speed_enabled?: boolean
  /** The panel's upload limit in bytes (config `client-area.upload_max_bytes`): the archive dialogs refuse a bigger file before uploading. */
  upload_max_bytes?: number
  /** App-lite only: one of `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`. */
  default_date_format?: string
  integrations?: HomeIntegrations
  /** The Community panel (no Admin Area, setup wizard). */
  community_panel?: boolean
  /** The Community panel still needs the first-run setup. */
  setup_required?: boolean
  /** The delivered first-user variables could not create the account: the wizard is closed and the login page says what to fix. */
  setup_blocked?: boolean
  /** Login through the hub is on. */
  hub_login?: boolean
  /** Legacy reads it strictly as `=== false`: the Community panel is not paired with the hub. */
  hub_paired?: boolean
  single_server?: {
    active?: boolean
    has_running_tasks?: boolean
    has_uncompleted_imports?: boolean
  }
}

export interface HomeResponse {
  app: HomeApp
  user?: HomeUser
  admin?: { app_url?: string }
  after_register_redirect_url?: string
}

/** Intermediate multi-step flags from POST /login (or home-shaped body on success). */
export interface LoginIntermediateFlags {
  use_password?: boolean
  set_password?: boolean
  verify_email?: boolean
  two_factor?: boolean
  redirect_to?: string
}

export type LoginResponse = LoginIntermediateFlags & Partial<HomeResponse>

export function isLoginIntermediate (data: LoginResponse): boolean {
  return (
    data.use_password === true
    || data.set_password === true
    || data.verify_email === true
    || data.two_factor === true
    || Boolean(data.redirect_to)
  )
}

export interface RegisterRequest {
  'email': string
  'password'?: string | null
  'language'?: string
  'g-recaptcha-response'?: string
  'control-panel-upgrade-token'?: string
}

/** Intermediate flags from POST /register plus home-shaped body on success. */
export type RegisterResponse = Pick<LoginIntermediateFlags, 'set_password' | 'verify_email'> & Partial<HomeResponse>

export function isRegisterIntermediate (data: RegisterResponse): boolean {
  return data.set_password === true || data.verify_email === true
}

/**
 * Resolve language for POST /register:
 * i18next.language → localStorage client-area-language → home default_language.
 */
export function resolveRegisterLanguage (homeDefaultLanguage?: string | null): string {
  const fromI18n = i18next.language?.trim()
  if (fromI18n) {
    return fromI18n
  }

  const fromStorage = localStorage.getItem('client-area-language')?.trim()
  if (fromStorage) {
    return fromStorage
  }

  const fromHome = homeDefaultLanguage?.trim()
  if (fromHome) {
    return fromHome
  }

  return 'en'
}

export async function fetchCsrfCookie (): Promise<void> {
  if (getXsrfToken()) {
    return
  }

  await api.get('/csrf-cookie')
}

export async function login (payload: LoginRequest): Promise<LoginResponse> {
  await fetchCsrfCookie()
  const { data } = await api.post<LoginResponse>('/login', payload)
  return data
}

/** Success is Fortify 204 — caller must GET /home afterwards. */
export async function submitTwoFactorChallenge (
  payload: TwoFactorChallengeRequest,
): Promise<void> {
  await api.post('/two-factor-challenge', payload)
}

export async function fetchTwoFactorRecoveryCodes (): Promise<string[]> {
  const { data } = await api.get<string[]>('/user/two-factor-recovery-codes')
  return data
}

export async function regenerateTwoFactorRecoveryCodes (): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/user/two-factor-recovery-codes')
}

export async function fetchHome (): Promise<HomeResponse> {
  const { data } = await api.get<HomeResponse>('/home')
  return data
}

/**
 * `GET /home` waits at most this long. The router guard waits for it on every cold start, so a request
 * that never answers used to leave the page empty for good; after the timeout the guard goes on as offline (a protected route
 * leads to `/login`). Only `/home`: uploads and long POSTs keep axios' default (no limit).
 */
export const HOME_TIMEOUT_MS = 30_000

/** `/home` goes through the cache, so `0` fetches again and a missing value uses the default TTL. */
export async function getHomeCached (seconds?: number | null): Promise<HomeResponse> {
  const { data } = await cachedGet<HomeResponse>('/home', seconds, { timeout: HOME_TIMEOUT_MS })
  return data
}

export async function logout (): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/logout')
}

export interface ForgotPasswordResponse {
  message: string
}

/** `POST /forgot-password` with `{ email }`; errors propagate with their `response`. */
export async function forgotPassword (email: string): Promise<ForgotPasswordResponse> {
  await fetchCsrfCookie()
  const { data } = await api.post<ForgotPasswordResponse>('/forgot-password', { email })
  return data
}

export interface ResetPasswordRequest {
  /** Raw route query values (also missing or an array): sent as is, an `undefined` one drops out of the JSON. */
  token: LocationQueryValue | LocationQueryValue[] | undefined
  email: LocationQueryValue | LocationQueryValue[] | undefined
  password: string
  password_confirmation: string
}

export interface ResetPasswordResponse {
  message: string
}

/** `POST /reset-password` with `{ token, email, password, password_confirmation }`; errors propagate with their `response`. */
export async function resetPassword (payload: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  await fetchCsrfCookie()
  const { data } = await api.post<ResetPasswordResponse>('/reset-password', payload)
  return data
}

/** Email verification code from the verify_email login branch. */
export async function verifyEmailCode (code: string): Promise<LoginResponse> {
  await fetchCsrfCookie()
  const { data } = await api.post<LoginResponse>('/verify-code', { code })
  return data
}

export async function resendVerificationCode (): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/resend-code')
}

/** OAuth/social redirect URL used by login/register social buttons. Optional token appends to the API GET only. */
export async function fetchSocialRedirectUrl (
  provider: string,
  options?: { token?: string | null },
): Promise<string> {
  const token = options?.token
  if (token) {
    const { data } = await api.get<{ data: { url: string } }>(
      `/auth/${provider}/redirect-url`,
      { params: { token } },
    )
    return data.data.url
  }

  const { data } = await api.get<{ data: { url: string } }>(`/auth/${provider}/redirect-url`)
  return data.data.url
}

export async function register (
  payload: RegisterRequest,
  options?: { defaultLanguage?: string | null },
): Promise<RegisterResponse> {
  await fetchCsrfCookie()

  const language = payload.language ?? resolveRegisterLanguage(options?.defaultLanguage)
  const body: Record<string, unknown> = {
    email: payload.email,
    password: payload.password ?? null,
    language,
  }

  if (payload['g-recaptcha-response']) {
    body['g-recaptcha-response'] = payload['g-recaptcha-response']
  }

  const cpToken = payload['control-panel-upgrade-token']
    ?? readControlPanelUpgradeToken()
  if (cpToken) {
    body['control-panel-upgrade-token'] = cpToken
  }

  try {
    const { data } = await api.post<RegisterResponse>('/register', body)
    // `set_password` / `verify_email` are steps of the same sign-up, and the call that continues it needs the token again
    // (legacy re-read it from `localStorage` on every `Auth.register()`); anything else ends the hand-over.
    if (!isRegisterIntermediate(data)) {
      clearControlPanelUpgradeToken()
    }
    return data
  } catch (error) {
    clearControlPanelUpgradeToken()
    throw error
  }
}

/** Finish OAuth return: CSRF then POST /auth/{provider}/callback + browser search. */
export async function postSocialCallback (
  provider: string,
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): Promise<HomeResponse> {
  await fetchCsrfCookie()
  const suffix = search && !search.startsWith('?') ? `?${search}` : search
  const { data } = await api.post<HomeResponse>(`/auth/${provider}/callback${suffix}`)
  return data
}

/**
 * SSO token exchange: CSRF then POST /sso-login with the token in the query, no body.
 * Plain concatenation like legacy, so a missing token is sent as `token=null`.
 */
export async function postSsoLogin (token: string | null): Promise<void> {
  await fetchCsrfCookie()
  await api.post('/sso-login?token=' + token)
}

/** CSRF then POST /hub-login with `{ ticket }`; answers the body's `redirect` (a ticket for one app), unchecked. */
export async function postHubLogin (ticket: string): Promise<unknown> {
  await fetchCsrfCookie()
  const { data } = await api.post<{ redirect?: unknown } | undefined>('/hub-login', { ticket })
  return data?.redirect
}

/** GET /hub-login/start answers `{ url }` (not `{ data: { url } }` like social). */
export async function fetchHubLoginStartUrl (): Promise<string> {
  await fetchCsrfCookie()
  const { data } = await api.get<{ url: string }>('/hub-login/start')
  return data.url
}

export interface AcceptInvitationResponse {
  password_required?: boolean
  login_required?: boolean
  success?: string
}

export interface AcceptInvitationPasswords {
  password: string
  password_confirmation: string
}

/**
 * POST /accept-invitation (the /accept-invite screen on mount and on submit, and LoginView after sign-in).
 * No CSRF call, like legacy. `token` is the raw route query value (also missing or an array): it is sent as is.
 */
export async function acceptInvitation (
  token: unknown,
  passwords?: AcceptInvitationPasswords,
): Promise<AcceptInvitationResponse> {
  const { data } = await api.post<AcceptInvitationResponse>('/accept-invitation', { token, ...passwords })
  return data
}

/** Persist the signed-in user language preference (shell switcher only). */
export async function putUserLanguage (language: string): Promise<void> {
  await api.put('/user/language', { language })
}
