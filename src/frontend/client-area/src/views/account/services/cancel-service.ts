import type { CancelServiceResult } from './services.api'

/** The six reasons of the select, in legacy order. */
export const CANCEL_REASON_KEYS = [
  'heading.cancelServiceModal.reason.option.performance',
  'heading.cancelServiceModal.reason.option.expensive',
  'heading.cancelServiceModal.reason.option.support',
  'heading.cancelServiceModal.reason.option.technical',
  'heading.cancelServiceModal.reason.option.panel',
  'heading.cancelServiceModal.reason.option.other',
] as const

/** The description needs at least 10 characters; the Submit button also waits for a reason. */
export function canSubmit (reason: string | null | undefined, otherReason: string): boolean {
  return Boolean(reason) && otherReason.length >= 10
}

/** A picked reason fills an empty description only. */
export function describeAfterReasonPick (reasonText: string, otherReason: string): string {
  return otherReason === '' ? reasonText : otherReason
}

export type CancelOutcome = { redirect: string } | { cancelled: true }

/** A `cancel_url` in the answer sends the browser there, otherwise the list is reloaded. */
export function resolveCancelOutcome (result: CancelServiceResult | undefined | null): CancelOutcome {
  const cancelUrl = result?.cancel_url
  return cancelUrl ? { redirect: cancelUrl } : { cancelled: true }
}
