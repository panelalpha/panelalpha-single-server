// Pure step logic of the change-domain modal (`SetYourDomainModal`). Vue-free, so the decisions are unit-tested without mounting.

/** 0 = "Set domain" panel, 1 = "Set subdomain" panel, `undefined` = both collapsed. */
export type ChangeDomainPanel = number | undefined

/** The name that is verified and submitted. */
export function domainComputed (
  panel: ChangeDomainPanel,
  clientDomain: string,
  freeName: string,
  affix: string,
): string {
  return panel === 0 ? clientDomain : `${freeName}.${affix}`
}

/**
 * Deliberate departure from legacy: legacy sends `PUT subdomain` with empty fields when both panels are
 * collapsed (`panelOpen === undefined`). Only the two panels submit.
 */
export function canSubmitForm (panel: ChangeDomainPanel): boolean {
  return panel === 0 || panel === 1
}

/**
 * First step after the form: the transfer step (2) when the plan allows transfer and the registrar asks for
 * verification; otherwise the DNS gate decides what follows (`'verify-dns'`, see `needsDnsGate`).
 */
export function nextStepAfterForm (input: {
  transferAllowed: boolean
  verificationRequired: boolean
}): 2 | 'verify-dns' {
  return input.transferAllowed && input.verificationRequired ? 2 : 'verify-dns'
}

/**
 * The eager DNS verification (step 3) runs only for the "Set domain" panel, from step 0 or 2, when the plan
 * has eager verification on.
 */
export function needsDnsGate (input: { step: number, panel: ChangeDomainPanel, eager: boolean | undefined }): boolean {
  return (input.step === 0 || input.step === 2) && input.panel === 0 && Boolean(input.eager)
}

/**
 * The CDN branch of opening the modal.
 * - options carry records: they are used and written to the instance;
 * - empty options on a plan with CDN: the options cache is dropped and the instance's own records are kept (empty array when none);
 * - empty options without CDN: empty records, written to the instance.
 * The caller writes `records` to the instance only when `clearCache` is false (legacy never touches the instance on the middle branch).
 */
export function resolveCdnRecords<T> (input: {
  optionsRecords: T[] | null | undefined
  planHasCdn: boolean
  instanceRecords: T[] | null | undefined
}): { records: T[], clearCache: boolean } {
  const options = input.optionsRecords ?? []
  if (options.length > 0) {
    return { records: options, clearCache: false }
  }
  if (input.planHasCdn) {
    const existing = Array.isArray(input.instanceRecords) ? input.instanceRecords : []
    return { records: existing.length > 0 ? existing : [], clearCache: true }
  }
  return { records: options, clearCache: false }
}

/** The flags `isNameserversCorrected`, `isRetried`, `isVerificationSuccessful`: not in legacy `data`. */
export interface VerificationFlags {
  isNameserversCorrected: boolean
  isRetried: boolean
  isVerificationSuccessful: boolean
}

/** `verification_record` of `GET /services/{id}/domains/verify`: the DNS record the user adds to prove control of the domain. */
export interface VerificationRecord {
  name?: string
  type?: string
  content?: string
}

/**
 * Every opening of the modal starts with the flags cleared. Legacy keeps them between openings, so a
 * "tryAgain" message from the last session shows up on the next opening.
 */
export function resetVerificationFlags (): VerificationFlags {
  return { isNameserversCorrected: false, isRetried: false, isVerificationSuccessful: false }
}

/** A first attempt starts with `isNameserversCorrected` false, as the eager gate reads it only after the attempt. */
export function beginVerificationAttempt (flags: VerificationFlags, firstAttempt: boolean): VerificationFlags {
  return firstAttempt ? { ...flags, isNameserversCorrected: false } : flags
}

/**
 * Outcome of the verification: a successful re-check
 * (not the first attempt) sets `isVerificationSuccessful`, so the green step 3 is reachable. A failed re-check sets `isRetried`.
 */
export function finishVerificationAttempt (
  flags: VerificationFlags,
  input: { resolved: boolean, firstAttempt: boolean },
): VerificationFlags {
  if (input.resolved) {
    return {
      ...flags,
      isNameserversCorrected: true,
      isVerificationSuccessful: input.firstAttempt ? flags.isVerificationSuccessful : true,
    }
  }
  return input.firstAttempt ? flags : { ...flags, isRetried: true }
}

/** Which message step 3 shows: success first, then "incorrect" until a re-check has failed, then "try again". */
export function verificationMessage (flags: VerificationFlags): 'success' | 'incorrect' | 'tryAgain' {
  if (flags.isVerificationSuccessful) {
    return 'success'
  }
  return flags.isRetried ? 'tryAgain' : 'incorrect'
}
