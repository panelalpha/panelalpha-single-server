declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

let loadPromise: Promise<void> | null = null

export function loadRecaptchaScript (siteKey: string | null | undefined): Promise<void> {
  if (!siteKey) {
    return Promise.resolve()
  }

  if (window.grecaptcha !== undefined) {
    return Promise.resolve()
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => {
      loadPromise = null
      reject(new Error('Failed to load reCAPTCHA script'))
    })
    document.head.append(script)
  })

  return loadPromise
}

/** Invisible reCAPTCHA v3 token; omit from POST body when site key is empty. */
export async function executeRecaptcha (
  siteKey: string | null | undefined,
  action: string,
): Promise<string | undefined> {
  if (!siteKey) {
    return undefined
  }

  await loadRecaptchaScript(siteKey)

  const grecaptcha = window.grecaptcha
  if (!grecaptcha) {
    throw new Error('reCAPTCHA failed to initialize')
  }

  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      void grecaptcha.execute(siteKey, { action })
        .then(token => resolve(token))
        .catch(reject)
    })
  })
}

/** Hides Google's floating badge once the user is signed in. */
export function hideRecaptchaBadge (): void {
  const element = document.querySelector<HTMLElement>('.grecaptcha-badge')
  if (element) {
    element.style.display = 'none'
  }
}
