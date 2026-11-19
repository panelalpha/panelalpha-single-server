// Pure logic of the page frame (`PageFrame.vue`).

/** One tab of the page tab strip (My Account, Settings): the `v-model:tab` value, the translated title and an optional test id. */
export interface PageFrameTab {
  value: number
  title: string
  testid?: string
}

/**
 * The title row stacks (filters under the title) on `xs`, and below 976px when the page has filters in the title row (legacy Services
 * `mdAndDown ? 'flex-column'`). Without filters the title is the only item, so the direction does not show.
 */
export function isHeadStacked (display: { xs: boolean, mdAndDown: boolean }, hasFilters: boolean): boolean {
  return display.xs || (hasFilters && display.mdAndDown)
}
