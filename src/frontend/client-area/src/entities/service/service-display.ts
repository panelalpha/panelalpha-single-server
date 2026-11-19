import type { Translate } from '@/shared/ui/modal/action-modal'

/**
 * The fields of a `/home` service that the copy modal and the onboarding service picker read. Structural, so both
 * `CopyService` and `OnboardingService` fit without a cast.
 */
export interface ServiceSummary {
  plan_name?: string
  instance_count?: number
  instance_limit?: number
  hosting_accounts?: ReadonlyArray<object>
}

/**
 * An unlimited limit is stored as the largest 64 bit integer (`9223372036854775807`), as a number or a string.
 * `null` and `undefined` are not unlimited.
 */
export function isUnlimitedLimit (limit: unknown): boolean {
  return Number(limit) > Number.MAX_SAFE_INTEGER
}

/** The limit as display text: "Unlimited" for an unlimited limit, else the number (0 when missing). */
export function instanceLimitText (limit: number | string | null | undefined, t: Translate): string {
  return isUnlimitedLimit(limit) ? t('form.value.unlimited') : String(limit ?? 0)
}

/**
 * Item text of a service select: `Plan (count/limit Instances) - domain`. The domain comes from the first hosting account and is left out when there is none.
 */
export function serviceLabel (service: ServiceSummary, t: Translate): string {
  const count = service.instance_count ?? 0
  const limit = instanceLimitText(service.instance_limit, t)
  const title = `${String(service.plan_name ?? '')} (${t('heading.onboarding.chooseProduct.product.instancesLimit', { count, limit })})`
  const domain = (service.hosting_accounts?.[0] as { domain?: unknown } | undefined)?.domain
  return typeof domain === 'string' && domain !== '' ? `${title} - ${domain}` : title
}

/**
 * The service is at or over its instance limit. `Number` keeps the
 * JS comparison of legacy: a missing count or limit (`undefined`) is never reached, a `null` one counts as 0.
 */
export function serviceLimitReached (service: ServiceSummary | undefined): boolean {
  return Number(service?.instance_count) >= Number(service?.instance_limit)
}
