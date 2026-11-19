import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, tr } from './auth'
import { footerProbe, languageActivatorProbe, shellHandlers } from './shell'

// Lite is the source of truth (AGENTS.md, M-2): copy is read from the lite fixture, not the app one.
const tl = (key: string) => tr(key, 'lite')

// Square 120x120 logos (not 200x60) so `contain` letterboxes; different images for light and dark show the `darkLogo` choice.
const customLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTIwIDEyMCI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIHJ4PSIyNCIgZmlsbD0iIzFhOGY1YSIvPjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjI4IiBmaWxsPSIjZmZmZmZmIi8+PC9zdmc+'
const customDarkLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTIwIDEyMCI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIHJ4PSIyNCIgZmlsbD0iI2U4YTMxNyIvPjxyZWN0IHg9IjMyIiB5PSIzMiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiBmaWxsPSIjMWIxYjFiIi8+PC9zdmc+'

// The path must not contain `/api/`: the fixtures router would intercept it.
const probes: ParityState['probes'] = [
  {
    // Anchor.
    key: 'card',
    legacy: page => page.locator('.error-page .card'),
    next: page => page.getByTestId('not-found-card'),
  },
  {
    key: 'logo',
    legacy: page => page.locator('.logo-wrapper'),
    next: page => page.getByTestId('not-found-logo'),
  },
  {
    key: 'logo-image',
    legacy: page => page.locator('.logo-wrapper .v-image'),
    next: page => page.getByTestId('not-found-logo-image'),
    internal: true,
  },
  {
    key: 'illustration',
    legacy: page => page.locator('.error-logo'),
    next: page => page.getByTestId('not-found-illustration'),
  },
  {
    key: 'title',
    legacy: page => page.getByText(tl('heading.notFoundPage.title'), { exact: true }),
    next: page => page.getByTestId('not-found-title'),
  },
  {
    key: 'info',
    legacy: page => page.getByText(tl('heading.notFoundPage.info'), { exact: true }),
    next: page => page.getByTestId('not-found-info'),
  },
  {
    key: 'button',
    legacy: page => page.getByRole('link', { name: tl('button.home.back') }),
    next: page => page.getByTestId('not-found-home'),
  },
]

export const pageNotFound: ParityState = {
  id: 'page-not-found',
  path: '/this-page-does-not-exist',
  actions: { legacy: [], next: [] },
  probes,
}

export const pageNotFoundCustomLogo: ParityState = {
  id: 'page-not-found-custom-logo',
  path: '/this-page-does-not-exist',
  home: { app: { theme: { logo: customLogo, darkLogo: customDarkLogo } } },
  actions: { legacy: [], next: [] },
  probes,
}

// "Back To Home" is an `<a>` in both apps, so the hover helper looks for role `link`.
export const pageNotFoundButtonHover = buttonHoverState(pageNotFound, 'page-not-found-button-hover', 'button.home.back', 'lite', 'link')
export const pageNotFoundButtonFocus = buttonFocusState(pageNotFound, 'page-not-found-button-focus', 'button.home.back', 'lite', 'link')

// Signed in: the same 404 view under the lite frame, which adds the footer with LanguageSwitcher (LITE App.vue:40-43, next App.vue:35-38).
// Built by hand, not with `shellState`: that one adds navbar probes the 404 page does not have. `/home` gets `user`, so the
// legacy footer and the next AppFooter render; `shellHandlers` answers the shell calls (notifications, labels, projects).
export const pageNotFoundSignedIn: ParityState = {
  id: 'page-not-found-signed-in',
  path: '/this-page-does-not-exist',
  target: 'lite',
  signedIn: true,
  home: { user: { has_hosting_access: true } },
  handlers: shellHandlers([], 'projects'),
  actions: { legacy: [], next: [] },
  probes: [...probes, footerProbe, languageActivatorProbe],
}

// Raw SVG markup as the logo (LITE PageNotFound.vue:17-23 `v-html` in a div; next BrandLogo turns it into an `<img src="data:…">`).
// Known DOM difference of the shared BrandLogo (Charge E, deferred): not fixed here. The `logo-image` probe is dropped
// because the legacy markup has no `.v-image` element.
const markupLogo = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#1a8f5a"/><circle cx="60" cy="60" r="28" fill="#ffffff"/></svg>'
const markupDarkLogo = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#e8a317"/><rect x="32" y="32" width="56" height="56" fill="#1b1b1b"/></svg>'
const markupLogoProbes = probes.filter(probe => probe.key !== 'logo-image')

export const pageNotFoundMarkupLogo: ParityState = {
  id: 'page-not-found-markup-logo',
  path: '/this-page-does-not-exist',
  target: 'lite',
  home: { app: { theme: { logo: markupLogo, darkLogo: markupDarkLogo } } },
  actions: { legacy: [], next: [] },
  probes: markupLogoProbes,
}

const states: ParityState[] = [
  pageNotFound,
  pageNotFoundCustomLogo,
  pageNotFoundButtonHover,
  pageNotFoundButtonFocus,
  pageNotFoundSignedIn,
  pageNotFoundMarkupLogo,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, { target: 'lite', ...state })
  })
}
