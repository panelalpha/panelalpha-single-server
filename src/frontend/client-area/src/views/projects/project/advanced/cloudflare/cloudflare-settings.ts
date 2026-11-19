// The pure parts of `data` and `computed`: the security level options,
// the `'on'` mapping and the `isDataFetched` flag.

export interface CloudflareSecurityLevel {
  value: string
  labelKey: string
}

/** The six security levels in legacy order. The view translates `labelKey`. */
export const CLOUDFLARE_SECURITY_LEVELS: readonly CloudflareSecurityLevel[] = [
  { value: 'off', labelKey: 'form.option.cloudflareSecurity.off' },
  { value: 'essentially_off', labelKey: 'form.option.cloudflareSecurity.essentiallyOff' },
  { value: 'low', labelKey: 'form.option.cloudflareSecurity.low' },
  { value: 'medium', labelKey: 'form.option.cloudflareSecurity.medium' },
  { value: 'high', labelKey: 'form.option.cloudflareSecurity.high' },
  { value: 'under_attack', labelKey: 'form.option.cloudflareSecurity.underAttack' },
]

/** The browser check and the development mode are on only for the string `'on'`. */
export function isCloudflareOn (value: unknown): boolean {
  return value === 'on'
}

/**
 * The skeleton is shown only while all three fetches are in flight. The flag is `true` only
 * when all three are `true`; a single finished request turns the skeleton off for every card.
 */
export function isCloudflareLoading (fetchingDevelopment: boolean, fetchingBrowser: boolean, fetchingSecurity: boolean): boolean {
  return fetchingDevelopment && fetchingBrowser && fetchingSecurity
}
