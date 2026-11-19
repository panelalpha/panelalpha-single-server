// Unlike the card cut (`plugin-card.ts`), it runs on any length: a description shorter than 100 characters loses its last word too, and one with no
// space in the first 100 characters renders nothing. Kept 1:1 on purpose.

const CUT_LENGTH = 100

/**
 * Cuts the description at the last space among the first 100 characters and keeps that space, as legacy did. Returns `undefined`
 * when there is no such space (the table cell is empty then). A missing description counts as no space.
 */
export function truncateDescription (text: string | null | undefined): string | undefined {
  if (!text) {
    return undefined
  }
  for (let index = CUT_LENGTH; index > 0; index--) {
    if (text.charAt(index - 1) === ' ') {
      return `${text.slice(0, index - 1)} `
    }
  }
  return undefined
}
