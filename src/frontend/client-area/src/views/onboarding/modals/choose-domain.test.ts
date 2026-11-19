import type { OnboardingService } from '@/views/onboarding/onboarding-service'
import type { ContinueState } from './choose-domain'
import { describe, expect, it } from 'vitest'
import {
  chooseDomainActionKey,
  chooseDomainSecondary,
  composeFreeDomainName,
  domainNameOf,
  isBlacklistedDomain,
  isContinueDisabled,
  typedDomainName,
} from './choose-domain'

function service (patch: Record<string, unknown> = {}): OnboardingService {
  return { id: 1, status: 'active', ...patch } as unknown as OnboardingService
}

const ready: ContinueState = {
  loading: false,
  validating: false,
  freeMode: false,
  composed: '',
  error: null,
  passed: true,
  lastValidated: 'shop.pl',
  current: 'shop.pl',
}

describe('domainNameOf', () => {
  it('reads the name of a domain object and the trimmed text of a string', () => {
    expect(domainNameOf({ domain: ' shop.pl ' })).toBe('shop.pl')
    expect(domainNameOf('  blog.pl ')).toBe('blog.pl')
    expect(domainNameOf(null)).toBe('')
  })
})

describe('isBlacklistedDomain', () => {
  it('matches the entry itself and its subdomains, not a longer name ending in it', () => {
    expect(isBlacklistedDomain('google.com', ['google.com'])).toBe(true)
    expect(isBlacklistedDomain('mail.google.com', ['google.com'])).toBe(true)
    expect(isBlacklistedDomain('notgoogle.com', ['google.com'])).toBe(false)
  })

  it('reads * as any run of characters', () => {
    expect(isBlacklistedDomain('x.bad.pl', ['*.bad.pl'])).toBe(true)
    expect(isBlacklistedDomain('bad.pl', ['*.bad.pl'])).toBe(false)
  })

  it('never blacklists an empty name', () => {
    expect(isBlacklistedDomain('', ['google.com'])).toBe(false)
  })
})

describe('composeFreeDomainName', () => {
  it('joins the lower-cased parts and waits for both', () => {
    expect(composeFreeDomainName(' MyShop ', 'Example.com')).toBe('myshop.example.com')
    expect(composeFreeDomainName('', 'example.com')).toBe('')
    expect(composeFreeDomainName('shop', '')).toBe('')
  })
})

describe('typedDomainName', () => {
  it('prefers the typed text when it differs from the picked domain', () => {
    expect(typedDomainName('new.pl', { domain: 'old.pl' })).toBe('new.pl')
  })

  it('keeps the picked domain when the typed text is the same name', () => {
    expect(typedDomainName('OLD.pl', { domain: 'old.pl' })).toBe('old.pl')
  })

  it('falls back to the typed text, then to the string model', () => {
    expect(typedDomainName('typed.pl', '')).toBe('typed.pl')
    expect(typedDomainName('', 'string.pl')).toBe('string.pl')
    expect(typedDomainName('', '')).toBe('')
  })
})

describe('isContinueDisabled', () => {
  it('is enabled once the current name passed its check', () => {
    expect(isContinueDisabled(ready)).toBe(false)
  })

  it('is disabled while a request runs', () => {
    expect(isContinueDisabled({ ...ready, loading: true })).toBe(true)
    expect(isContinueDisabled({ ...ready, validating: true })).toBe(true)
  })

  it('is disabled until the check passed for the current name', () => {
    expect(isContinueDisabled({ ...ready, passed: false })).toBe(true)
    expect(isContinueDisabled({ ...ready, lastValidated: 'other.pl' })).toBe(true)
    expect(isContinueDisabled({ ...ready, error: 'taken' })).toBe(true)
  })

  it('needs the check for every name, also one the service list already holds (another project)', () => {
    expect(isContinueDisabled({ ...ready, passed: false, lastValidated: null })).toBe(true)
  })

  it('in the subdomain panel needs a composed name that passed', () => {
    const free = { ...ready, freeMode: true, current: 'sub.example.com', lastValidated: 'sub.example.com' }
    expect(isContinueDisabled({ ...free, composed: '' })).toBe(true)
    expect(isContinueDisabled({ ...free, composed: 'sub.example.com' })).toBe(false)
    expect(isContinueDisabled({ ...free, composed: 'sub.example.com', error: 'taken' })).toBe(true)
  })
})

describe('chooseDomainActionKey', () => {
  it('reads continue for a non-WordPress installation or a transfer or DNS service', () => {
    expect(chooseDomainActionKey(service(), 'git')).toBe('button.continue')
    expect(chooseDomainActionKey(service({ onboarding: { server_allow_domain_transfer: true } }), 'wordpress')).toBe('button.continue')
    expect(chooseDomainActionKey(service({ onboarding: { eager_domain_dns_verification_enabled: true } }), 'wordpress')).toBe('button.continue')
  })

  it('reads set website with a site name, create website otherwise', () => {
    expect(chooseDomainActionKey(service({ ask_for_site_name: true }), 'wordpress')).toBe('button.website.set')
    expect(chooseDomainActionKey(service(), 'wordpress')).toBe('button.website.create')
  })
})

describe('chooseDomainSecondary', () => {
  it('offers change service with several services', () => {
    expect(chooseDomainSecondary(2, service(), 'wordpress')).toBe('change-service')
  })

  it('offers change theme for a WordPress service that can choose one', () => {
    expect(chooseDomainSecondary(1, service({ onboarding_mode: 'advanced' }), 'wordpress')).toBe('change-theme')
    expect(chooseDomainSecondary(1, service({ onboarding_mode: 'advanced' }), 'git')).toBe('maybe-later')
  })

  it('offers maybe later otherwise', () => {
    expect(chooseDomainSecondary(1, service({ onboarding_mode: 'simple' }), 'wordpress')).toBe('maybe-later')
  })
})
