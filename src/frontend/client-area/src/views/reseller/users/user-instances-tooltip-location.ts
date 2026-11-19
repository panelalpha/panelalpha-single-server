import type { LocationStrategyFunction } from 'vuetify'

// V2 `v-menu` `offset-x` + `left` / `right` + `nudge-*: 12px`, no `offset-y`.
// The content sits flush beside the activator, 12px away, with its top at the activator top. When the card does not fit
// below, V2 slides it up until its bottom is 12px above the viewport bottom (`calcYOverflow`); it never mirrors it to the
// activator bottom. The V4 connected strategy flips the vertical alignment instead (measured on 375x812: card y 460 -> 253)
// and has no prop to switch the flip off, so this strategy repeats the V2 arithmetic.
const GAP = 12
const MARGIN = 12

export function userInstancesTooltipLocation (left: boolean): LocationStrategyFunction {
  return (data, props, contentStyles) => {
    function updateLocation (): void {
      const content = data.contentEl.value
      const target = data.target.value
      if (!content || !(target instanceof HTMLElement)) {
        return
      }
      const activator = target.getBoundingClientRect()
      const width = content.offsetWidth
      const height = content.offsetHeight
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight

      const preferredX = left ? activator.left - GAP - width : activator.right + GAP
      const x = Math.max(MARGIN, Math.min(preferredX, viewportWidth - MARGIN - width))
      const y = Math.max(MARGIN, Math.min(activator.top, viewportHeight - MARGIN - height))

      Object.assign(contentStyles.value, {
        transformOrigin: left ? 'right top' : 'left top',
        top: `${Math.round(y)}px`,
        left: `${Math.round(x)}px`,
        maxHeight: `${props.maxHeight ?? ''}px`,
      })
    }

    return { updateLocation }
  }
}
