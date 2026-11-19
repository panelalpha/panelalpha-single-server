import { type DOMWrapper, flushPromises } from '@vue/test-utils'

/** The hover opened no tooltip (the activator has no `aria-describedby`). */
export class TooltipNotOpenedError extends Error {}

/**
 * Hover an activator and return the content element of the tooltip it opens (`aria-describedby` points at the overlay).
 * The wait covers the `open-delay` of 150 ms the kit tooltips use.
 */
export async function openTooltip (activator: DOMWrapper<Element>): Promise<HTMLElement> {
  await activator.trigger('mouseenter')
  await new Promise(resolve => setTimeout(resolve, 300))
  await flushPromises()
  const id = activator.attributes('aria-describedby')
  if (!id) {
    throw new TooltipNotOpenedError('the activator has no aria-describedby: the tooltip did not open')
  }
  const content = [...document.querySelectorAll('.v-overlay')].find(element => element.id === id)?.querySelector<HTMLElement>('.v-overlay__content')
  if (!content) {
    throw new Error(`no tooltip content for ${id}`)
  }
  return content
}
