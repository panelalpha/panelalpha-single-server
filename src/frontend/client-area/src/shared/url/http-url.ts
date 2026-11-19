/**
 * Returns the value when it is an absolute `http:` or `https:` URL, otherwise an empty string. Use it for `:href` built from API data, so a
 * `javascript:` or other scheme never reaches an anchor.
 */
export function httpUrlOrEmpty (value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}
