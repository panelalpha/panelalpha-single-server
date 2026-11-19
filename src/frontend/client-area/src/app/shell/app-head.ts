import type { HomeApp } from '@/shared/session/session.api'

/**
 * App-level document behaviour: the body theme class and the
 * `custom_js_header` / `custom_css` / `custom_js_footer` injection.
 */

/** Exactly one of `is-dark` / `is-light` on the body. */
export function applyBodyThemeClass (dark: boolean): void {
  document.body.classList.remove('is-dark', 'is-light')
  document.body.classList.add(dark ? 'is-dark' : 'is-light')
}

export function appendScript (content: string, parent: HTMLElement): void {
  const script = document.createElement('script')
  script.textContent = content
  parent.append(script)
}

/** The style block goes through a contextual fragment, as in legacy. */
export function appendStyle (content: string, parent: HTMLElement): void {
  const block = `<style type="text/css">${content}</style>`
  parent.append(document.createRange().createContextualFragment(block))
}

/** Header script, custom CSS, footer script, each only when `/home` carries it. */
export function injectCustomCode (app: Pick<HomeApp, 'custom_css' | 'custom_js_header' | 'custom_js_footer'> | undefined): void {
  if (!app) {
    return
  }
  if (app.custom_js_header) {
    appendScript(app.custom_js_header, document.head)
  }
  if (app.custom_css) {
    appendStyle(app.custom_css, document.head)
  }
  if (app.custom_js_footer) {
    appendScript(app.custom_js_footer, document.body)
  }
}
