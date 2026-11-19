/** Only an http(s) URL is opened. */
export function isValidPaymentUrl (value: unknown): boolean {
  let url: URL
  try {
    url = new URL(String(value))
  } catch {
    return false
  }
  return url.protocol === 'http:' || url.protocol === 'https:'
}
