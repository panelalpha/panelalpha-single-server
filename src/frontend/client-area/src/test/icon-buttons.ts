import type { VueWrapper } from '@vue/test-utils'
import { DOMWrapper } from '@vue/test-utils'
import { normalizeHtml } from '@/test/normalize-html'
import { openTooltip, TooltipNotOpenedError } from '@/test/tooltip'

export interface IconButtonSnapshot {
  html: string
  // Markup and class of the tooltip content after a hover; `null` for a disabled button or a button without a tooltip.
  tooltip: { html: string, className: string } | null
}

/**
 * DOM of the icon buttons under `root` (`button.v-btn--icon` by default) and, for each enabled one, the tooltip it opens on hover.
 * Characterization of the row actions (kit-button-icon): the markup, the tooltip text and its class stay as written by hand.
 */
export async function iconButtonsSnapshot (root: VueWrapper | DOMWrapper<Element>, selector = 'button.v-btn--icon'): Promise<IconButtonSnapshot[]> {
  const result: IconButtonSnapshot[] = []
  for (const button of root.findAll(selector)) {
    const html = normalizeHtml(button.html())
    let tooltip: IconButtonSnapshot['tooltip'] = null
    if (!button.element.hasAttribute('disabled')) {
      try {
        const content = await openTooltip(button)
        // The markup of the content is read through the wrapper (a test helper outside `src/shared/html` writes and reads no `innerHTML`).
        tooltip = { html: normalizeHtml([...content.children].map(child => new DOMWrapper(child).html()).join('')), className: content.className }
      } catch (error) {
        // Only a tooltip that did not open is `null`; any other error fails the test.
        if (!(error instanceof TooltipNotOpenedError)) {
          throw error
        }
        tooltip = null
      }
    }
    result.push({ html, tooltip })
  }
  return result
}
