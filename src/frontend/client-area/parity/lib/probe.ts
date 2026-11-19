import type { Locator, Page } from '@playwright/test'

/** Pairs one legacy element with one next element under a key. */
export interface Probe {
  key: string
  legacy: (page: Page) => Locator
  next: (page: Page) => Locator
  /** What the probed element is: the element itself, a field box or a field input. */
  part?: 'self' | 'box' | 'input'
  /** Framework-internal Vuetify part that cannot carry a data-testid. */
  internal?: boolean
  /**
   * Variant filter. A probe for an element that one variant never renders (Add new on mobile, the FAB on desktop)
   * would otherwise report `missing` in both apps. The viewport is all a state knows about the variant.
   */
  when?: (variant: { name: string, viewport: { width: number, height: number } }) => boolean
  /**
   * Per app: read the computed styles of this pseudo-element of the matched element instead of the element's own. V2
   * paints the button hover/focus overlay as `.v-btn::before`, V4 as a real `.v-btn__overlay` element. The box and text
   * stay the element's.
   */
  pseudo?: Partial<Record<'legacy' | 'next', '::before' | '::after'>>
}
