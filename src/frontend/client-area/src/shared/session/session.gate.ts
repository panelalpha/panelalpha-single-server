/** Legacy-parity session gate: localStorage `{origin}-loggedin` + XSRF-TOKEN cookie. */

export function loggedInStorageKey (): string {
  return `${window.location.origin}-loggedin`
}

export function getXsrfToken (): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }

  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
  if (!match?.[1]) {
    return undefined
  }

  return decodeURIComponent(match[1])
}

export function isLoggedInGate (): boolean {
  return Boolean(localStorage.getItem(loggedInStorageKey()) && getXsrfToken())
}

export function setLoggedInFlag (): void {
  localStorage.setItem(loggedInStorageKey(), 'true')
}

export function clearLoggedInFlag (): void {
  localStorage.removeItem(loggedInStorageKey())
}
