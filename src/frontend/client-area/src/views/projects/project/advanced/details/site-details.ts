import type { InstanceResource } from '@/entities/project/instance-resource'
import { fromNow } from '@/shared/time/from-now'

// The clock is a parameter: the functions never read `new Date()` themselves.

export type Translate = (key: string) => string

export type TrialInstance = Pick<InstanceResource, 'service_is_trial' | 'service_trial_expiry_at' | 'plan_upgrade_link'>

export interface TrialState {
  isTrial: boolean
  expired: boolean
  text: string
  upgradeUrl: string
}

/**
 * `expired` is computed here on purpose: the similar
 * `isExpired` in `src/shared/session/trial-rules.ts` is private and typed on `HomeService`, so it is not reused.
 */
export function trialState (instance: TrialInstance, t: Translate, now: Date = new Date()): TrialState {
  const isTrial = !!instance.service_is_trial
  if (!isTrial) {
    return { isTrial: false, expired: false, text: '', upgradeUrl: trialUpgradeUrl(instance) }
  }

  const expiry = new Date(String(instance.service_trial_expiry_at))
  // Without a readable expiry date there is no text to show; `fromNow` would print "Invalid date".
  if (Number.isNaN(expiry.getTime())) {
    return { isTrial, expired: false, text: '', upgradeUrl: trialUpgradeUrl(instance) }
  }
  const expired = expiry.getTime() < now.getTime()
  const label = expired ? t('general.trialExpired') : t('general.trialExpires')

  return {
    isTrial,
    expired,
    text: `${label} ${fromNow(expiry, now)}`,
    upgradeUrl: trialUpgradeUrl(instance),
  }
}

/** The plan link when there is one, `''` otherwise. */
function trialUpgradeUrl (instance: Pick<InstanceResource, 'plan_upgrade_link'>): string {
  const link = instance.plan_upgrade_link
  return typeof link === 'string' ? link : ''
}

/** The version row hides only for an explicit `null` (an unknown version still shows). */
export function showVersionRow (instance: Pick<InstanceResource, 'status'>): boolean {
  return instance.status?.wordpress !== null
}
