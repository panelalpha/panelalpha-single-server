import type { Ref } from 'vue'
import { onScopeDispose, watch } from 'vue'

// Legacy V2 `v-tooltip bottom`: the content is centred under the activator, 10px below it, and moves up
// when it would end below the viewport (12px margin). It never flips above the activator, which V4's connected strategy does
// (the sites tooltip of the 2nd row opened 191px higher on a 375x812 screen).
const GAP = 10
const MARGIN = 12

export interface TooltipBox {
  width: number
  height: number
}

export interface TooltipAnchor {
  left: number
  width: number
  bottom: number
}

export interface TooltipViewport {
  width: number
  height: number
}

/** Top and left (viewport coordinates) of a bottom-centred tooltip, kept inside the viewport as V2 did. */
export function tooltipPosition (anchor: TooltipAnchor, box: TooltipBox, viewport: TooltipViewport): { top: number, left: number } {
  const top = Math.min(anchor.bottom + GAP, viewport.height - MARGIN - box.height)
  const centred = anchor.left + anchor.width / 2 - box.width / 2
  const left = Math.max(MARGIN, Math.min(centred, viewport.width - MARGIN - box.width))
  return { top, left }
}

interface TooltipLocationData {
  target: Ref<HTMLElement | [number, number] | undefined>
  contentEl: Ref<HTMLElement | undefined>
  isActive: Ref<boolean>
}

/** `location-strategy` of the sites tooltip: places the content with `tooltipPosition`. */
export function legacyBottomTooltipLocation (
  data: TooltipLocationData,
  _props: unknown,
  contentStyles: Ref<Record<string, string>>,
): { updateLocation: () => void } {
  function update (): void {
    const target = data.target.value
    const content = data.contentEl.value
    if (!(target instanceof HTMLElement) || !content) {
      return
    }
    const anchor = target.getBoundingClientRect()
    // `offsetWidth` / `offsetHeight` ignore the transform of the `custom-tooltip` transition.
    const { top, left } = tooltipPosition(
      { left: anchor.left, width: anchor.width, bottom: anchor.bottom },
      { width: content.offsetWidth, height: content.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    contentStyles.value = {
      top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`,
    }
  }

  const observer = new ResizeObserver(update)
  watch([data.isActive, data.contentEl], ([active, element], [, previous]) => {
    if (previous) {
      observer.unobserve(previous)
    }
    if (active && element) {
      observer.observe(element)
      update()
    }
  }, { flush: 'post', immediate: true })
  onScopeDispose(() => observer.disconnect())

  return { updateLocation: update }
}
