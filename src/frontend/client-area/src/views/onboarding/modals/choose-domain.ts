import type { InstallationTypeKey, OnboardingService } from '@/views/onboarding/onboarding-service'
import { asksForSiteName, canTransferDomain, hasEagerDnsVerification } from '@/views/onboarding/onboarding-service'
import { canChooseTheme } from '@/views/onboarding/onboarding-steps'

// The pure rules of the domain modal. The modal keeps the state and the requests; these rules decide.

/** The name of a combobox value (a domain of the list, or the typed text), trimmed. */
export function domainNameOf (value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return String((value as { domain?: unknown }).domain ?? '').trim()
  }
  return String(value ?? '').trim()
}

/**
  * The blacklist rule: the domain matches a blacklist entry or one of its subdomains. `*` in an
 * entry matches anything, and the dots are literal. An empty name is never blacklisted (the required rule speaks for it).
 */
export function isBlacklistedDomain (name: string, blacklist: readonly string[]): boolean {
  if (!name) {
    return false
  }
  const domain = name.toLowerCase()
  return blacklist.some(entry => {
    const escaped = entry
      .toLowerCase()
      .replace(/\./g, String.raw`\.`)
      .replace(/\*/g, '.*')
    return new RegExp(String.raw`^${escaped}$|\.(${escaped})$`).test(domain)
  })
}

/** `subdomain.affix` in lower case, or empty while either part is missing. */
export function composeFreeDomainName (subdomain: string, affix: string): string {
  const name = subdomain.trim().toLowerCase()
  const base = affix.trim().toLowerCase()
  return name && base ? `${name}.${base}` : ''
}

/**
  * Outside the subdomain panel: the typed text wins when it differs from the picked value, else the
 * picked value's name, else the typed text.
 */
export function typedDomainName (search: string, model: unknown): string {
  const fromSearch = search.trim()
  const fromModel = domainNameOf(model)
  if (typeof model === 'object' && model !== null) {
    return fromSearch && fromSearch.toLowerCase() !== fromModel.toLowerCase() ? fromSearch : fromModel
  }
  return fromSearch || fromModel
}

/** The state the continue button reads. */
export interface ContinueState {
  /** A request of the flow runs. */
  loading: boolean
  /** The availability check runs. */
  validating: boolean
  /** Subdomain panel open. */
  freeMode: boolean
  /** The composed subdomain name, only in the subdomain panel. */
  composed: string
  /** Availability error of the current check. */
  error: string | null
  /** The current check passed. */
  passed: boolean
  /** The name the last passing check ran for. */
  lastValidated: string | null
  /** The current name (the composed one in the subdomain panel). */
  current: string
}

/** The continue button stays disabled until the availability check of the current name passed, and while a request runs. */
export function isContinueDisabled (state: ContinueState): boolean {
  if (state.loading || state.validating) {
    return true
  }
  if (state.freeMode) {
    if (!state.composed) {
      return true
    }
    return Boolean(state.error) || !state.passed || state.lastValidated !== state.current
  }
  return Boolean(state.error) || !state.passed || state.lastValidated !== state.current
}

/**
  * The continue button's copy: "continue" when the service transfers domains, verifies DNS, or the
 * installation is not WordPress; otherwise "set website" with a site name, or "create website".
 */
export function chooseDomainActionKey (service: OnboardingService | undefined, installationType: InstallationTypeKey): string {
  if (canTransferDomain(service) || hasEagerDnsVerification(service) || installationType !== 'wordpress') {
    return 'button.continue'
  }
  return asksForSiteName(service) ? 'button.website.set' : 'button.website.create'
}

/** The secondary button under continue: change service, change theme, or maybe later. */
export type ChooseDomainSecondary = 'change-service' | 'change-theme' | 'maybe-later'

export function chooseDomainSecondary (servicesCount: number, service: OnboardingService | undefined, installationType: InstallationTypeKey): ChooseDomainSecondary {
  if (servicesCount > 1) {
    return 'change-service'
  }
  if (canChooseTheme(service) && installationType === 'wordpress') {
    return 'change-theme'
  }
  return 'maybe-later'
}
