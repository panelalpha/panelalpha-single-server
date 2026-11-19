// The item named in a dialog, in a grey box. The legacy class is scoped to the view and a
// `v-html` message cannot pick a scoped style, so the box carries its look inline (tokens as in `_general` of legacy). `border` is the
// colour token name without the `var(--v-` prefix: plugins use `gray-lighten3`, themes `gray-lighten2`.
// The labels come in already escaped by the caller.

import type { ModalTargetRatingBox } from '@/shared/ui/modal/basic-modal.types'
import { ratingLabel, starPercent } from '@/entities/project/wordpress-items'

// The name is
// `gray darken1` (the box text, and the rating next to the name, stay in the modal text colour). The V2 class is dead in V4, so the span
// carries the utility `text-gray-darken-1` (`theme-utilities.scss`, `!important`, on the `copy` class list of `sanitize-html.ts`).
const NAME_CLASS = 'text-gray-darken-1'

function boxStyle (border: string, flat: boolean): string {
  return [
    'display: flex',
    'align-items: center',
    'border-radius: 6px',
    `border: 1px solid var(--v-${border})`,
    'background: var(--v-gray-lighten5)',
    'padding: 16px',
    flat ? 'margin: 0 0 8px' : 'margin-top: 16px',
    'font-weight: 600',
  ].join('; ')
}

/**
 * The same box with a rating for `BasicModal` (`targetRatingBox`): the caller escapes the label, `BasicModal` renders the box with the
 * kit star and the number (they are components, not `v-html`).
 */
export function targetItemRatingBox (labelHtml: string, rawRating: number, border: ModalTargetRatingBox['border'] = 'gray-lighten3', flat = false): ModalTargetRatingBox {
  return { labelHtml, rating: String(ratingLabel(rawRating)), percent: starPercent(rawRating), border, flat }
}

/** One item in the grey box. `extraHtml` goes inside the box after the label (the install dialog's rating). */
// `flat`: the box carries its margins itself (`0 0 8px`), the 16 px above it is the `.basic-modal-target` wrapper's.
export function targetItemBox (labelHtml: string, extraHtml = '', border = 'gray-lighten3', flat = false): string {
  return `<span class="target-item-box" style="${boxStyle(border, flat)}"><span class="${NAME_CLASS}">${labelHtml}</span>${extraHtml}</span>`
}

// The array branch of the same slot: one row per item in a column, `mb-3` between the rows. Legacy renders
// the box for any array, an empty one too (the mass update with nothing to update), so this does as well.
export function targetListBox (labelsHtml: string[], border = 'gray-lighten3', flat = false): string {
  const rows = labelsHtml
    .map((label, index) => `<span class="${NAME_CLASS}" style="display: flex${index < labelsHtml.length - 1 ? '; margin-bottom: 12px' : ''}">${label}</span>`)
    .join('')
  return `<span class="target-item-box flex-column" style="${boxStyle(border, flat)}; flex-direction: column; align-items: stretch">${rows}</span>`
}
