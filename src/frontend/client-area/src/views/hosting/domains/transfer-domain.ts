import type { DomainVerification } from '@/views/hosting/hosting.api'

// The logic of the transfer domain modal: "Transfer now" asks the backend again.

/** `verification_record` of `GET /services/{id}/domains/verify`: the DNS record the user adds to prove control of the domain. */
export interface TransferDnsRecord {
  [key: string]: unknown
  type?: string
  name?: string
  content?: string
}

export type TransferOutcome
  = | { kind: 'record-required', record: TransferDnsRecord | undefined }
    | { kind: 'transfer' }

/** A verification that is still required shows the (new) record, anything else goes on to the add. */
export function transferOutcome (response: DomainVerification | null | undefined): TransferOutcome {
  if (response?.verification_required) {
    return { kind: 'record-required', record: response.verification_record as TransferDnsRecord | undefined }
  }
  return { kind: 'transfer' }
}

/** The record from the last "Transfer now" wins over the one the Add check returned. */
export function effectiveTransferRecord (local: TransferDnsRecord | null, initial: TransferDnsRecord | null | undefined): TransferDnsRecord | null {
  return local ?? initial ?? null
}
