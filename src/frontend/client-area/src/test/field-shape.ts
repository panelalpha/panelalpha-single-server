import type { DOMWrapper } from '@vue/test-utils'

// Helpers of the form field tests: the shape of a text field (what autofill, validation and the label rely on) and
// the control that follows a form label. They read attributes and the DOM tree only, never `innerHTML`.

export interface FieldShape {
  name: string | undefined
  autocomplete: string | undefined
  type: string | undefined
  label: string
  icon: boolean
}

/** `field` is the root of a `v-text-field` (the element that carries the `data-testid`). */
export function fieldShape (field: DOMWrapper<Element>): FieldShape {
  const input = field.get('input')
  const id = input.attributes('id')
  const label = id ? field.find(`label[for="${id}"]`) : null
  return {
    name: input.attributes('name'),
    autocomplete: input.attributes('autocomplete'),
    type: input.attributes('type'),
    label: label?.exists() ? label.text() : '',
    icon: field.find('.v-field__prepend-inner .v-icon').exists(),
  }
}

/** Form labels under `root` in document order; the `label.v-label` that Vuetify renders inside its own controls is skipped. */
export function formLabels (root: Element): HTMLLabelElement[] {
  return [...root.querySelectorAll<HTMLLabelElement>('label:not(.v-label)')]
}

/** The form label under `root` whose trimmed text is `text`, or null. */
export function labelByText (root: Element, text: string): HTMLLabelElement | null {
  return formLabels(root).find(label => (label.textContent ?? '').trim() === text) ?? null
}

/** The first element matching `selector` after `label` in document order, when no other form label comes between them; else null. */
export function controlAfterLabel (root: Element, label: Element, selector: string): Element | null {
  const all = [...root.querySelectorAll(`label:not(.v-label), ${selector}`)]
  const next = all[all.indexOf(label) + 1]
  return next !== undefined && next.matches(selector) ? next : null
}
