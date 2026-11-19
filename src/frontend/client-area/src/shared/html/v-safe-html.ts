import type { Directive, DirectiveBinding } from 'vue'
import { isHtmlProfile, sanitizeHtml } from './sanitize-html'

// `v-safe-html`: the one way to render HTML in the app (raw `v-html` is banned, `no-raw-html.test.ts`). Import it in `<script setup>`
// (`import { vSafeHtml } from '@/shared/html/v-safe-html'`): Vue picks it up as a local directive, so a component test needs no plugin.
// It sets `innerHTML` on the element the template already has, so classes, scoped styles and the DOM stay as `v-html` made them.
//
// The argument names the profile that fits the source of the HTML (`sanitize-html.ts`): `v-safe-html="text"` is `copy`,
// `v-safe-html:rich="text"`, `v-safe-html:external="text"`, `v-safe-html:svg="text"`. An unknown argument gets the strictest text
// profile (`external`), so a typo never loosens the filter.

export type SafeHtmlValue = string | null | undefined

interface Shown {
  value: SafeHtmlValue
  arg: string | undefined
  html: string
}

// What each element shows now. `element.innerHTML` cannot be compared with the sanitized string: the browser re-serializes it
// (`&copy;` becomes `©`, a first newline in `<pre>` is dropped), so it would differ on every update and the element would be rewritten.
const shown = new WeakMap<HTMLElement, Shown>()

function render (element: HTMLElement, binding: DirectiveBinding<SafeHtmlValue>): void {
  const { value, arg } = binding
  const last = shown.get(element)
  // The host re-renders for many reasons; sanitize again only when the text or the profile changed (long lists, log rows).
  if (last && last.value === value && last.arg === arg) {
    return
  }
  const profile = arg === undefined ? 'copy' : (isHtmlProfile(arg) ? arg : 'external')
  const html = sanitizeHtml(value, profile)
  if (last?.html !== html) {
    element.innerHTML = html
  }
  shown.set(element, { value, arg, html })
}

export const vSafeHtml: Directive<HTMLElement, SafeHtmlValue> = {
  mounted: render,
  updated: render,
  // SSR is not used; `getSSRProps` would be the place to return `{ innerHTML: sanitizeHtml(...) }` if it ever is.
}
