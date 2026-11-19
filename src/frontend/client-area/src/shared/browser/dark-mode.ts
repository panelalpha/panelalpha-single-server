function getIframeDocument (): Document | null {
  try {
    const iframe = document.querySelector('iframe')
    if (!iframe) {
      return null
    }
    return iframe.contentDocument ?? iframe.contentWindow?.document ?? null
  } catch {
    return null
  }
}

/** Body and fm iframe classes only; colours, logos and the Vuetify theme follow `theme.store` (`useThemeSync`). */
export function applyBodyDarkClasses (dark: boolean): void {
  document.body.classList.add('no-transition')

  const iframeDoc = getIframeDocument()
  const fm = iframeDoc?.getElementById('fm')
  if (fm) {
    fm.classList.add('no-transition')
    fm.classList.toggle('is-dark', dark)
    setTimeout(() => fm.classList.remove('no-transition'), 100)
  }

  document.body.classList.remove('is-dark', 'is-light')
  document.body.classList.add(dark ? 'is-dark' : 'is-light')
  setTimeout(() => document.body.classList.remove('no-transition'), 100)
}

export function setStoredDarkMode (dark: boolean): void {
  try {
    localStorage.setItem('isDarkMode', dark ? 'true' : 'false')
  } catch {
    // storage unavailable
  }
}
