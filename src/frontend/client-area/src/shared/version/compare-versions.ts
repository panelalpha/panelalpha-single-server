// Numeric version compare for the update checks. Legacy compared version strings with `>` and `.sort()`, so `11.3.0` read as lower
// than `9.0.0`. This helper compares the numeric segments as numbers. The difference from legacy is deliberate.

const NUMERIC_SEGMENT = /^\d+$/

interface ParsedVersion {
  /** True when the input is empty after trimming, a leading `v` and build metadata. */
  empty: boolean
  /** Numeric core, one number per dot-separated segment. A segment that is not all digits counts as 0 (`6.x` reads as `6.0`). */
  segments: number[]
  /** Pre-release suffix after the first `-`, or the empty string when there is none. */
  suffix: string
}

function sign (n: number): -1 | 0 | 1 {
  if (n > 0) {
    return 1
  }
  return n < 0 ? -1 : 0
}

function parse (version: string | null | undefined): ParsedVersion {
  let text = (version ?? '').trim()
  if (/^v/i.test(text)) {
    text = text.slice(1)
  }
  const plus = text.indexOf('+')
  if (plus !== -1) {
    text = text.slice(0, plus)
  }
  const dash = text.indexOf('-')
  const core = dash === -1 ? text : text.slice(0, dash)
  const suffix = dash === -1 ? '' : text.slice(dash + 1)

  return {
    empty: text === '',
    segments: core.split('.').map(segment => (NUMERIC_SEGMENT.test(segment) ? Number(segment) : 0)),
    suffix,
  }
}

/**
 * Compares two versions and returns `-1`, `0` or `1`. A missing side (`null`, `undefined`, `''`) is lower than any version.
 * Missing trailing segments count as 0, so `6.5` equals `6.5.0`. Within the same core, a version without a suffix is greater than
 * one with a suffix (`6.6` > `6.6-RC1`), and two suffixes compare as text with numeric chunks (`RC10` > `RC2`).
 */
export function compareVersions (a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 {
  const left = parse(a)
  const right = parse(b)
  if (left.empty || right.empty) {
    return left.empty === right.empty ? 0 : sign(left.empty ? -1 : 1)
  }

  const length = Math.max(left.segments.length, right.segments.length)
  for (let index = 0; index < length; index++) {
    const difference = (left.segments[index] ?? 0) - (right.segments[index] ?? 0)
    if (difference !== 0) {
      return sign(difference)
    }
  }

  if (left.suffix === '' || right.suffix === '') {
    return left.suffix === right.suffix ? 0 : sign(left.suffix === '' ? 1 : -1)
  }
  return sign(left.suffix.localeCompare(right.suffix, 'en', { numeric: true, sensitivity: 'base' }))
}

/** True when the available version is greater than the installed one. An available version over an uninstalled product is an update. */
export function versionGreater (available: string | null | undefined, current: string | null | undefined): boolean {
  return compareVersions(available, current) > 0
}

/** The highest version in the list by `compareVersions`, or `undefined` for an empty list. On a tie the first one wins. */
export function highestVersion (versions: readonly string[]): string | undefined {
  let highest: string | undefined
  for (const version of versions) {
    if (highest === undefined || compareVersions(version, highest) > 0) {
      highest = version
    }
  }
  return highest
}
