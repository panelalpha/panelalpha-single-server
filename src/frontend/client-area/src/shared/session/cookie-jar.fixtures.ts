/**
 * Test-only cookie jar. Avoids unicorn/no-document-cookie by never assigning
 * to document.cookie in tests — reads go through a defineProperty getter.
 */

let cookieJar = ''

export function installTestCookies (): void {
  cookieJar = ''
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get () {
      return cookieJar
    },
    set () {
      // Ignore assignments; tests mutate the jar via helpers below.
    },
  })
}

export function setTestCookie (name: string, value: string): void {
  const parts = cookieJar
    .split('; ')
    .filter(part => part.length > 0 && !part.startsWith(`${name}=`))
  parts.push(`${name}=${value}`)
  cookieJar = parts.join('; ')
}

export function clearTestCookies (): void {
  cookieJar = ''
}
