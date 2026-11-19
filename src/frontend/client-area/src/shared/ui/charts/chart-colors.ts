/**
 * Series colours of the analytics charts (General and Monitoring). Legacy paints them with fixed values, so they are the same in both
 * themes; the values live as tokens in `themes-variables.scss` (`:root`), and Apex needs a resolved colour string.
 */
export type ChartColorName
  = | 'bandwidth'
    | 'visitors'
    | 'pie-1'
    | 'pie-2'
    | 'pie-3'
    | 'pie-4'
    | 'pie-5'
    | 'pie-stroke'
    | 'pie-fallback'
    | 'axis-label'
    | 'grid'

export function chartColor (name: ChartColorName): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--v-chart-${name}`).trim()
}
