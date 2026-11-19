// Pure logic of the General info card (`InfoCard.vue`).

/** Width of the card in the General grid: a quarter (four per row from 1200px, two from 576px), a half or the whole row. */
export type InfoCardSpan = 'quarter' | 'half' | 'full'

/** `v-col` breakpoint props of the card column (`cols="12" sm="6" md="6" xl="3"`; the analytics cards `xl="6"` or full). */
export function infoCardColumns (span: InfoCardSpan): Record<string, string> {
  if (span === 'half') {
    return { cols: '12', xl: '6' }
  }
  if (span === 'full') {
    return { cols: '12' }
  }
  return { cols: '12', sm: '6', md: '6', xl: '3' }
}
