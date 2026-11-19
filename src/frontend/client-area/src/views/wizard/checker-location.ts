import type { Ref } from 'vue'
import { onScopeDispose, watch } from 'vue'

// The password hint of the wizard (in the admin area a V2 `v-menu` with `offset-y`) opens under the field. V4's
// connected strategy puts it flush against the field (no gap), and when the room under the field is smaller than the hint (every phone,
// and a 900px high window with the footer below) it flips above the field and covers the Email field. Here the hint always
// stays under the field, 8px away. Nothing else moves: on a short screen the page scrolls, the hint follows because its position is a
// document position, and it may reach into the footer strip, which is empty at the width of the field.
export const CHECKER_GAP = 8

export interface CheckerAnchor {
  left: number
  bottom: number
}

/** Top and left (viewport coordinates) of the hint: under the field, `CHECKER_GAP` away, left edges aligned. */
export function checkerPosition (anchor: CheckerAnchor): { top: number, left: number } {
  return { top: anchor.bottom + CHECKER_GAP, left: anchor.left }
}

/**
 * Bottom edge the hint keeps its distance from: the field, or the lowest rule message under it. The message is drawn in the 8px under
 * the field and below, so a hint at 8px under the field alone would cut the message in half.
 */
export function checkerAnchorBottom (fieldBottom: number, messageBottoms: number[]): number {
  return Math.max(fieldBottom, ...messageBottoms)
}

interface CheckerLocationData {
  target: Ref<HTMLElement | [number, number] | undefined>
  contentEl: Ref<HTMLElement | undefined>
  isActive: Ref<boolean>
}

/** `location-strategy` of the hint: places the content with `checkerPosition`, never flips. */
export function checkerLocation (
  data: CheckerLocationData,
  _props: unknown,
  contentStyles: Ref<Record<string, string>>,
): { updateLocation: () => void } {
  function update (): void {
    const target = data.target.value
    if (!(target instanceof HTMLElement) || !data.contentEl.value) {
      return
    }
    const rect = target.getBoundingClientRect()
    const messages = [...(target.closest('.v-input')?.querySelectorAll('.v-messages__message') ?? [])]
      .map(message => message.getBoundingClientRect())
      .filter(box => box.height > 0)
    const bottom = checkerAnchorBottom(rect.bottom, messages.map(box => box.bottom))
    const { top, left } = checkerPosition({ left: rect.left, bottom })
    contentStyles.value = {
      top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`,
    }
  }

  // The hint follows the field when it moves or grows: a rule message under any field of the form changes the height of the form, and
  // the body of the step is centred, so the field moves a few pixels without changing its own size.
  const observed = new Set<Element>()
  function observeAround (target: HTMLElement): void {
    for (const element of [target, target.parentElement, target.closest('form')]) {
      if (element && !observed.has(element)) {
        observed.add(element)
        observer.observe(element)
      }
    }
  }
  const observer = new ResizeObserver(update)
  // The message of the field comes and goes with a node of its own (and a fade, which is a change of classes), without a change of the
  // size of the field.
  const mutations = new MutationObserver(update)
  watch([data.isActive, data.target], ([active, target]) => {
    observer.disconnect()
    mutations.disconnect()
    observed.clear()
    if (active && target instanceof HTMLElement) {
      observeAround(target)
      const input = target.closest('.v-input')
      if (input) {
        mutations.observe(input, { attributes: true, childList: true, subtree: true })
      }
      update()
    }
  }, { flush: 'post', immediate: true })
  onScopeDispose(() => {
    observer.disconnect()
    mutations.disconnect()
  })

  return { updateLocation: update }
}
