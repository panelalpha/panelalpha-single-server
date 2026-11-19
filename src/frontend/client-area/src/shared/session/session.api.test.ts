import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  clearTestCookies,
  installTestCookies,
  setTestCookie,
} from './cookie-jar.fixtures'
import {
  acceptInvitation,
  fetchCsrfCookie,
  fetchHome,
  fetchHubLoginStartUrl,
  fetchSocialRedirectUrl,
  fetchTwoFactorRecoveryCodes,
  forgotPassword,
  getHomeCached,
  isLoginIntermediate,
  isRegisterIntermediate,
  login,
  logout,
  postHubLogin,
  postSocialCallback,
  postSsoLogin,
  putUserLanguage,
  regenerateTwoFactorRecoveryCodes,
  register,
  resendVerificationCode,
  resetPassword,
  resolveRegisterLanguage,
  submitTwoFactorChallenge,
  verifyEmailCode,
} from './session.api'

const i18nState = vi.hoisted(() => ({ language: 'en' as string | undefined }))

vi.mock('i18next', () => ({
  default: {
    get language () {
      return i18nState.language
    },
  },
}))

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('session.api', () => {
  beforeEach(() => {
    installTestCookies()
    clearTestCookies()
    vi.clearAllMocks()
    clearAllCachedGet()
    i18nState.language = 'en'
    localStorage.removeItem('client-area-language')
    localStorage.removeItem(`${window.location.origin}-token`)
    sessionStorage.clear()
  })

  it('detects intermediate login flags', () => {
    expect(isLoginIntermediate({ use_password: true })).toBe(true)
    expect(isLoginIntermediate({ set_password: true })).toBe(true)
    expect(isLoginIntermediate({ verify_email: true })).toBe(true)
    expect(isLoginIntermediate({ two_factor: true })).toBe(true)
    expect(isLoginIntermediate({ redirect_to: '/elsewhere' })).toBe(true)
    expect(isLoginIntermediate({ app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } })).toBe(false)
  })

  it('fetches CSRF cookie when XSRF-TOKEN is missing', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })

    await fetchCsrfCookie()

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
  })

  it('skips CSRF fetch when XSRF-TOKEN is present', async () => {
    setTestCookie('XSRF-TOKEN', 'present')

    await fetchCsrfCookie()

    expect(api.get).not.toHaveBeenCalled()
  })

  it('POSTs /login after ensuring CSRF', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { use_password: true },
    })

    const data = await login({ email: 'user@example.com' })

    expect(api.post).toHaveBeenCalledWith('/login', { email: 'user@example.com' })
    expect(data).toEqual({ use_password: true })
  })

  it('POSTs /two-factor-challenge', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 204, data: '' })

    await submitTwoFactorChallenge({ code: '123456' })

    expect(api.post).toHaveBeenCalledWith('/two-factor-challenge', { code: '123456' })
  })

  it('GETs /home', async () => {
    const home = { app: { name: 'PanelAlpha' } }
    vi.mocked(api.get).mockResolvedValueOnce({ data: home })

    await expect(fetchHome()).resolves.toEqual(home)
    expect(api.get).toHaveBeenCalledWith('/home')
  })

  it('getHomeCached reads /home through the cache and returns its data', async () => {
    const home = { app: { name: 'PanelAlpha' } }
    vi.mocked(api.get).mockResolvedValueOnce({ data: home })

    await expect(getHomeCached()).resolves.toEqual(home)
    await expect(getHomeCached()).resolves.toEqual(home)

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/home', { timeout: 30_000 })
  })

  it('getHomeCached(0) asks again on the next second', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    vi.mocked(api.get).mockResolvedValue({ data: { app: {} } })

    await getHomeCached(0)
    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'))
    await getHomeCached(0)

    expect(api.get).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('POSTs /logout after ensuring CSRF', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await logout()

    expect(api.post).toHaveBeenCalledWith('/logout')
  })

  it('POSTs /verify-code after ensuring CSRF', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    const home = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } }
    vi.mocked(api.post).mockResolvedValueOnce({ data: home })

    await expect(verifyEmailCode('1234')).resolves.toEqual(home)
    expect(api.post).toHaveBeenCalledWith('/verify-code', { code: '1234' })
  })

  it('POSTs /forgot-password with the email and no csrf request when the cookie exists', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'sent' } })

    await expect(forgotPassword('jane@example.com')).resolves.toEqual({ message: 'sent' })

    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/forgot-password', { email: 'jane@example.com' })
  })

  it('propagates /forgot-password failures unchanged', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    const error = { response: { status: 422, data: { errors: { email: ['bad'] } } } }
    vi.mocked(api.post).mockRejectedValueOnce(error)

    await expect(forgotPassword('x')).rejects.toBe(error)
  })

  it('POSTs /reset-password with the payload unchanged, after the csrf request when the cookie is missing', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Your password has been reset!' } })
    const payload = { token: 't', email: 'jane@example.com', password: 'Str0ng-pass-1', password_confirmation: 'Str0ng-pass-1' }

    await expect(resetPassword(payload)).resolves.toEqual({ message: 'Your password has been reset!' })

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/reset-password', payload)
  })

  it('sends a missing query value as undefined, so it drops out of the JSON body', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'ok' } })

    await resetPassword({ token: undefined, email: ['a@b.c', 'd@e.f'], password: 'x', password_confirmation: 'y' })

    const body = vi.mocked(api.post).mock.calls[0][1]
    expect(JSON.stringify(body)).toBe('{"email":["a@b.c","d@e.f"],"password":"x","password_confirmation":"y"}')
  })

  it('propagates /reset-password failures unchanged', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    const error = { response: { status: 422, data: { errors: { email: ['bad'] } } } }
    vi.mocked(api.post).mockRejectedValueOnce(error)

    await expect(resetPassword({ token: 't', email: 'e', password: 'p', password_confirmation: 'p' })).rejects.toBe(error)
  })

  it('POSTs /resend-code', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await resendVerificationCode()

    expect(api.post).toHaveBeenCalledWith('/resend-code')
  })

  it('GETs social redirect URL for a provider', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: { url: 'https://github.com/login/oauth/authorize?x=1' } },
    })

    const url = await fetchSocialRedirectUrl('github')

    expect(api.get).toHaveBeenCalledWith('/auth/github/redirect-url')
    expect(url).toBe('https://github.com/login/oauth/authorize?x=1')
  })
  it('POSTs /accept-invitation with token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await acceptInvitation('invite-abc')

    expect(api.post).toHaveBeenCalledWith('/accept-invitation', { token: 'invite-abc' })
  })

  it('POSTs /accept-invitation with the passwords next to the token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await acceptInvitation('invite-abc', { password: 'secret12', password_confirmation: 'secret12' })

    expect(api.post).toHaveBeenCalledWith('/accept-invitation', {
      token: 'invite-abc',
      password: 'secret12',
      password_confirmation: 'secret12',
    })
  })

  it('returns the accept-invitation response body', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { password_required: true } })

    await expect(acceptInvitation('invite-abc')).resolves.toEqual({ password_required: true })
  })

  it('sends a missing or array token unchanged and never fetches a CSRF cookie', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.get).mockClear()
    vi.mocked(api.post).mockClear()

    await acceptInvitation(undefined)
    await acceptInvitation(['a', 'b'])

    expect(api.post).toHaveBeenNthCalledWith(1, '/accept-invitation', { token: undefined })
    expect(api.post).toHaveBeenNthCalledWith(2, '/accept-invitation', { token: ['a', 'b'] })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('propagates accept-invitation failures for callers to swallow', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('network'))

    await expect(acceptInvitation('invite-abc')).rejects.toThrow('network')
  })
  it('detects register intermediate flags', () => {
    expect(isRegisterIntermediate({ set_password: true })).toBe(true)
    expect(isRegisterIntermediate({ verify_email: true })).toBe(true)
    expect(isRegisterIntermediate({ app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } })).toBe(false)
  })

  it('resolves register language from i18next then localStorage then home default', () => {
    i18nState.language = 'pl'
    expect(resolveRegisterLanguage('de')).toBe('pl')

    i18nState.language = undefined
    localStorage.setItem('client-area-language', 'fr')
    expect(resolveRegisterLanguage('de')).toBe('fr')

    localStorage.removeItem('client-area-language')
    expect(resolveRegisterLanguage('de')).toBe('de')

    expect(resolveRegisterLanguage(null)).toBe('en')
  })

  it('POSTs /register with email, language, optional captcha and CP token', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    i18nState.language = 'en'
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { set_password: true },
    })

    const data = await register({
      'email': 'user@example.com',
      'password': null,
      'g-recaptcha-response': 'captcha-token',
      'control-panel-upgrade-token': 'cp-token',
    })

    expect(api.post).toHaveBeenCalledWith('/register', {
      'email': 'user@example.com',
      'password': null,
      'language': 'en',
      'g-recaptcha-response': 'captcha-token',
      'control-panel-upgrade-token': 'cp-token',
    })
    expect(data).toEqual({ set_password: true })
  })

  it('resolves register language from localStorage when i18next language is empty', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    i18nState.language = ''
    localStorage.setItem('client-area-language', 'es')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { verify_email: true } })

    await register({ email: 'user@example.com' })

    expect(api.post).toHaveBeenCalledWith('/register', {
      email: 'user@example.com',
      password: null,
      language: 'es',
    })
  })

  it('resolves register language from home default when i18n and storage are empty', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    i18nState.language = ''
    vi.mocked(api.post).mockResolvedValueOnce({ data: { verify_email: true } })

    await register({ email: 'user@example.com' }, { defaultLanguage: 'de' })

    expect(api.post).toHaveBeenCalledWith('/register', {
      email: 'user@example.com',
      password: null,
      language: 'de',
    })
  })

  it('reads control-panel-upgrade-token from sessionStorage when not in payload', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    sessionStorage.setItem(`${window.location.origin}-token`, 'stored-cp')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { set_password: true } })

    await register({ email: 'user@example.com', password: 'secret123' })

    expect(api.post).toHaveBeenCalledWith('/register', {
      'email': 'user@example.com',
      'password': 'secret123',
      'language': 'en',
      'control-panel-upgrade-token': 'stored-cp',
    })
  })

  it('does not re-send a token an older build left in localStorage, and drops it', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    localStorage.setItem(`${window.location.origin}-token`, 'abandoned-cp')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { app: { name: 'PanelAlpha' } } })

    await register({ email: 'user@example.com', password: 'secret123' })

    expect(api.post).toHaveBeenCalledWith('/register', {
      email: 'user@example.com',
      password: 'secret123',
      language: 'en',
    })
    expect(localStorage.getItem(`${window.location.origin}-token`)).toBeNull()
  })

  it('removes the stored control-panel-upgrade-token once a register succeeded', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    sessionStorage.setItem(`${window.location.origin}-token`, 'stored-cp')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { app: { name: 'PanelAlpha' } } })

    await register({ email: 'user@example.com', password: 'secret123' })

    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBeNull()
  })

  it('removes the stored control-panel-upgrade-token when the register failed', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    sessionStorage.setItem(`${window.location.origin}-token`, 'stored-cp')
    vi.mocked(api.post).mockRejectedValueOnce(new Error('invalid_token'))

    await expect(register({ email: 'user@example.com', password: 'secret123' })).rejects.toThrow('invalid_token')

    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBeNull()
  })

  it('keeps the token while the same sign-up continues with set_password or verify_email', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    sessionStorage.setItem(`${window.location.origin}-token`, 'stored-cp')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { set_password: true } })

    await register({ email: 'user@example.com' })
    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBe('stored-cp')

    vi.mocked(api.post).mockResolvedValueOnce({ data: { verify_email: true } })
    await register({ email: 'user@example.com', password: 'secret123' })
    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBe('stored-cp')

    expect(api.post).toHaveBeenLastCalledWith('/register', {
      'email': 'user@example.com',
      'password': 'secret123',
      'language': 'en',
      'control-panel-upgrade-token': 'stored-cp',
    })
  })

  it('GETs social redirect-url with token params without mutating OAuth URL', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: { url: 'https://github.com/login/oauth/authorize?x=1' } },
    })

    const url = await fetchSocialRedirectUrl('github', { token: 'cp-token' })

    expect(api.get).toHaveBeenCalledWith('/auth/github/redirect-url', {
      params: { token: 'cp-token' },
    })
    expect(url).toBe('https://github.com/login/oauth/authorize?x=1')
    expect(url).not.toContain('cp-token')
  })

  it('POSTs social callback after ensuring CSRF with provider and search', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    const home = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } }
    vi.mocked(api.post).mockResolvedValueOnce({ data: home })

    const data = await postSocialCallback('github', '?code=abc&state=xyz')

    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/auth/github/callback?code=abc&state=xyz')
    expect(data).toEqual(home)
  })

  it('fetches CSRF before social callback POST when XSRF-TOKEN is missing', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    const home = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } }
    vi.mocked(api.post).mockResolvedValueOnce({ data: home })

    await postSocialCallback('google', '?code=1')

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/auth/google/callback?code=1')
  })

  it('does not call redirect-url GET from postSocialCallback', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { app: { name: 'PanelAlpha' } },
    })

    await postSocialCallback('github', '')

    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/auth/github/callback')
  })

  it('normalizes search without leading ? for social callback POST', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { app: { name: 'PanelAlpha' } },
    })

    await postSocialCallback('github', 'code=abc')

    expect(api.post).toHaveBeenCalledWith('/auth/github/callback?code=abc')
  })

  it('fetches CSRF before POSTing /sso-login with the token in the query and no body', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await postSsoLogin('abc123')

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/sso-login?token=abc123')
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0]!)
  })

  it('sends a missing SSO token as token=null like legacy concatenation', async () => {
    setTestCookie('XSRF-TOKEN', 'present')
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await postSsoLogin(null)

    expect(api.post).toHaveBeenCalledWith('/sso-login?token=null')
  })

  it('POSTs the hub ticket in the body after CSRF', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await expect(postHubLogin('tkt')).resolves.toBeUndefined()

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/hub-login', { ticket: 'tkt' })
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0]!)
  })

  it('answers the redirect a hub ticket for one app carries', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, redirect: '/projects/12' } })

    await expect(postHubLogin('tkt')).resolves.toBe('/projects/12')
  })

  it('reads the hub start url from the body, after CSRF', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { url: 'https://hub/x' } })

    await expect(fetchHubLoginStartUrl()).resolves.toBe('https://hub/x')

    expect(api.get).toHaveBeenNthCalledWith(1, '/csrf-cookie')
    expect(api.get).toHaveBeenNthCalledWith(2, '/hub-login/start')
  })

  it('PUTs /user/language with the language code', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })
    await putUserLanguage('pl')
    expect(api.put).toHaveBeenCalledWith('/user/language', { language: 'pl' })
  })

  it('GETs the two-factor recovery codes and returns them', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: ['ABCD-EFGH', 'IJKL-MNOP'] })

    const codes = await fetchTwoFactorRecoveryCodes()

    expect(api.get).toHaveBeenCalledWith('/user/two-factor-recovery-codes')
    expect(codes).toEqual(['ABCD-EFGH', 'IJKL-MNOP'])
  })

  it('POSTs /user/two-factor-recovery-codes after fetching the CSRF cookie', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })
    vi.mocked(api.post).mockResolvedValueOnce({ data: '' })

    await regenerateTwoFactorRecoveryCodes()

    expect(api.get).toHaveBeenCalledWith('/csrf-cookie')
    expect(api.post).toHaveBeenCalledWith('/user/two-factor-recovery-codes')
    expect(vi.mocked(api.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.post).mock.invocationCallOrder[0])
  })
})
