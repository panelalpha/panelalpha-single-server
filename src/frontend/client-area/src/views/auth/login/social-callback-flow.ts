import type { SocialCallbackDestination } from './social-callback-redirect'
import type { HomeResponse } from '@/shared/session/session.api'
import {
  resolveSocialCallbackDestination,
  resolveSocialCallbackFailure,
} from './social-callback-redirect'
import { resolveResellerDomainRedirect } from './social-callback-state'

export type SocialCallbackFlowDeps = {
  provider: string
  stateParam: unknown
  href: string
  replaceLocation: (url: string) => void
  socialLogin: (provider: string) => Promise<HomeResponse>
  /** Fires on success only, before the redirect. */
  emitAfterLogin: () => void
  navigate: (destination: SocialCallbackDestination) => unknown
}

/**
 * Reseller host jump (and stop), else
 * socialLogin → after-login (success only) → success destination / failure destination. Navigation happens exactly
 * once; its own errors are swallowed and never trigger a second navigation.
 */
export async function runSocialCallback (deps: SocialCallbackFlowDeps): Promise<void> {
  const jumpUrl = resolveResellerDomainRedirect(deps.href, deps.stateParam)
  if (jumpUrl !== null) {
    deps.replaceLocation(jumpUrl)
    return
  }

  let destination: SocialCallbackDestination
  let loggedIn = false
  try {
    const data = await deps.socialLogin(deps.provider)
    destination = resolveSocialCallbackDestination(data)
    loggedIn = true
  } catch (error) {
    destination = resolveSocialCallbackFailure(error)
  }

  if (loggedIn) {
    deps.emitAfterLogin()
  }

  try {
    await deps.navigate(destination)
  } catch {
    // Navigation failure must not cause a second navigation.
  }
}
