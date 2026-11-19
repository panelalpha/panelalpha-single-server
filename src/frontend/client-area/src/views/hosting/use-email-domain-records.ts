import type { DomainRecordsState } from '@/views/hosting/ui/hosting.types'
import type { EmailDomain } from './email-domain-records'
import { ref } from 'vue'
import { checkDomainRecords, domainKey } from './email-domain-records'

// Reactive state for the Email Addresses and
// Forwarders screens. The verdicts come from `checkDomainRecords`, so the module cache is shared with the frame's `checkAllDomains`.

/**
 * `records` is keyed by `String(domain.id)`, the key the records selector reads. A domain is loading from the moment it is checked
 * until its verdicts arrive; a domain whose verdict is cached resolves without a DNS lookup.
 */
export function useEmailDomainRecords () {
  const records = ref<Record<string, DomainRecordsState>>({})

  /** Checks the domains in parallel (no de-duplication, as legacy). The state of a domain keeps its last verdict while it loads. */
  async function check (domains: EmailDomain[]): Promise<void> {
    await Promise.all(domains.map(async domain => {
      const key = domainKey(domain)
      const previous = records.value[key]
      records.value[key] = {
        spf: { configured: previous?.spf.configured ?? false, loading: true },
        dkim: { configured: previous?.dkim.configured ?? false, loading: true },
      }

      const verdict = await checkDomainRecords(domain)
      records.value[key] = {
        spf: { configured: verdict.spf, loading: false },
        dkim: { configured: verdict.dkim, loading: false },
      }
    }))
  }

  return { records, check }
}
