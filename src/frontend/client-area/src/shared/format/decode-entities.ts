/**
 * Decodes the HTML entities of an API value to plain text (`&#8211;` → `–`, `&amp;` → `&`) without rendering it. Legacy put such values in
 * `v-html`; text interpolation shows the decoded value, and `escapeHtml(decodeEntities(value))` is the safe `v-html` form. Markup in the
 * value is dropped to its text; `DOMParser` runs no scripts and loads nothing.
 */
export function decodeEntities (value: string): string {
  if (!value.includes('&') && !value.includes('<')) {
    return value
  }
  return new DOMParser().parseFromString(value, 'text/html').documentElement.textContent ?? ''
}
