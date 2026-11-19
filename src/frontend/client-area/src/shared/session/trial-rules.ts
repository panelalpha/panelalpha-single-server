import type { HomeService } from '@/shared/session/session.api'

export type TrialVariant = 'warning' | 'danger'

/** The first active or suspended service that is a trial. */
export function getTrialService (services: readonly HomeService[] | undefined): HomeService | null {
  for (const service of services ?? []) {
    if (['active', 'suspended'].includes(String(service.status)) && service.is_trial) {
      return service
    }
  }
  return null
}

/** `moment(trial_expiry_at).isBefore(moment())`. */
function isExpired (service: HomeService, now: Date): boolean {
  return new Date(String(service.trial_expiry_at)).getTime() < now.getTime()
}

/** The variant: `danger` once the expiry is past, `warning` before, `null` without a trial service. */
export function trialVariant (services: readonly HomeService[] | undefined, now: Date = new Date()): TrialVariant | null {
  const service = getTrialService(services)
  if (!service?.is_trial) {
    return null
  }
  return isExpired(service, now) ? 'danger' : 'warning'
}

export function hasExpiredTrial (services: readonly HomeService[] | undefined, now: Date = new Date()): boolean {
  const service = getTrialService(services)
  return service ? isExpired(service, now) : false
}

export function trialUpgradeUrl (services: readonly HomeService[] | undefined): string {
  const link = getTrialService(services)?.plan_upgrade_link
  return typeof link === 'string' ? link : ''
}
