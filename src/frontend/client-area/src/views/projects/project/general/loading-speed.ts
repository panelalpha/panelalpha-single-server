import type { PerformanceScore } from '@/entities/project/instance-resource'

// The PageSpeed fraction (0..1) times 100 is the
// ring value; green from 90, amber from 50, red below. A missing score (`null`, `undefined`, or a missing strategy) is not a
// number: the legacy `performance_score.desktop` read throws on a missing object. Here it reads as the unknown value `-` with the
// red tone (a deviation from legacy).

export type SpeedColor = 'success' | 'warning' | 'error'

/** Fraction 0..1 to the percent the ring shows; `null` when there is no score. */
export function toPercent (fraction: number | null | undefined): number | null {
  return typeof fraction === 'number' && Number.isFinite(fraction) ? fraction * 100 : null
}

/** The ring value for a percent: the number, or `-` when unknown (legacy `isSpeedDefined ? speed : '-'`). */
export function speedValue (percent: number | null | undefined): number | string {
  return typeof percent === 'number' && Number.isFinite(percent) ? percent : '-'
}

/** The ring colour for a percent (legacy: `>= 90` success, `>= 50` warning, else error; an unknown value is error). */
export function speedColor (percent: number | null | undefined): SpeedColor {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return 'error'
  }
  if (percent >= 90) {
    return 'success'
  }
  return percent >= 50 ? 'warning' : 'error'
}

/** Both strategies have a score. */
export function isSpeedDefined (score: PerformanceScore | null | undefined): boolean {
  return toPercent(score?.desktop) !== null && toPercent(score?.mobile) !== null
}
