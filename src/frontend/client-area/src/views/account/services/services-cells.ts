import type { Service } from './services.types'

type Translate = (key: string) => string

export interface StatusChip {
  type: 'expires' | 'disabled'
  text: string
}

/** The one chip next to the plan name, in the legacy `v-if` / `v-else-if` order: cancelled, suspended, then trial. `trial: false` (billing off) leaves the trial chip out. */
export function statusChip (
  service: Pick<Service, 'status' | 'is_trial' | 'trial_expiry_at'>,
  t: Translate,
  fromNow: (date: string) => string,
  options?: { trial: boolean },
): StatusChip | null {
  if (service.status === 'cancelled') {
    return { type: 'expires', text: t('general.cancelled') }
  }
  if (service.status === 'suspended') {
    return { type: 'disabled', text: t('general.suspended') }
  }
  if ((options?.trial ?? true) && service.is_trial) {
    return { type: 'expires', text: `${t('Expires')} ${fromNow(service.trial_expiry_at ?? '')}` }
  }
  return null
}

export interface DomainTypeChip {
  key: 'maindomain' | 'addon' | 'subdomain' | 'alias'
  text: string
}

const DOMAIN_TYPE_KEYS = {
  main: 'maindomain',
  addon: 'addon',
  sub: 'subdomain',
  alias: 'alias',
} as const

/** An unknown or empty `domain_type` gives no chip (legacy threw). */
export function domainTypeChip (domainType: string | null | undefined, t: Translate): DomainTypeChip | null {
  if (!domainType || !Object.hasOwn(DOMAIN_TYPE_KEYS, domainType)) {
    return null
  }
  const type = domainType as keyof typeof DOMAIN_TYPE_KEYS
  return { key: DOMAIN_TYPE_KEYS[type], text: t(`heading.hosting.domains.domain.${type}`) }
}

/** The trial chip is orange, any other one primary. */
export function upgradeButtonColor (service: Pick<Service, 'is_trial'>): 'orange' | 'primary' {
  return service.is_trial ? 'orange' : 'primary'
}

export type CustomLabelTone = 'purple' | 'blue' | 'green' | 'orange' | 'gray'

/** Legacy `CustomLabel` colours by `type`, as a tone. The colours live in the `--v-custom-label-<tone>-*` tokens. */
export function customLabelTone (type: string | undefined): CustomLabelTone {
  switch (type) {
    case 'maindomain':
    case 'purple': {
      return 'purple'
    }
    case 'subdomain':
    case 'premium': {
      return 'blue'
    }
    case 'addon': {
      return 'green'
    }
    case 'free':
    case 'expires': {
      return 'orange'
    }
    default: {
      // `disabled` and every other type: grey chip, grey text.
      return 'gray'
    }
  }
}
