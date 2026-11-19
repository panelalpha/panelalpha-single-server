import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { expect } from 'vitest'

// Checks of the dialog shell of the modals (hosting, project pages) (the legacy `div.card-overlay` before the card, the legacy
// transition, a click on the overlay). The dialog is teleported to the body, so the card is read there, in the open overlay only.

/** The card of the open dialog: `cardSelector` inside `.v-overlay--active`. */
export function openCard (cardSelector: string): HTMLElement {
  const card = document.body.querySelector<HTMLElement>(`.v-overlay--active ${cardSelector}`)
  expect(card, `no open card ${cardSelector}`).not.toBeNull()
  return card!
}

/** The legacy overlay is the first child of the dialog content and the card follows it. Returns the overlay. */
export function expectOverlayBeforeCard (cardSelector: string): HTMLElement {
  const card = openCard(cardSelector)
  const content = card.closest<HTMLElement>('.v-overlay__content')
  expect(content, `no dialog content around ${cardSelector}`).not.toBeNull()
  const overlay = content!.firstElementChild as HTMLElement
  expect(overlay.classList.contains('card-overlay')).toBe(true)
  expect(overlay.nextElementSibling).toBe(card)
  return overlay
}

/** Every dialog of the component uses the legacy transition. */
export function expectLegacyTransition (wrapper: VueWrapper): void {
  const dialogs = wrapper.findAllComponents({ name: 'VDialog' })
  expect(dialogs.length).toBeGreaterThan(0)
  for (const dialog of dialogs) {
    expect(dialog.props('transition')).toBe('custom-dialog-transition')
  }
}

/** How many dialogs of the component are open. */
export function openDialogs (wrapper: VueWrapper): number {
  return wrapper.findAllComponents({ name: 'VDialog' }).filter(dialog => dialog.props('modelValue') === true).length
}

export async function clickOverlay (overlay: HTMLElement): Promise<void> {
  overlay.click()
  await flushPromises()
}
