import type { ProjectLimitValues } from './instance-resource'
import type { ProjectLimitsBody } from './project-limits.api'

export type LimitKey = keyof ProjectLimitValues

/** One field of the form: the unit the client types in, and how many stored units one typed unit is (1 GB = 1024 MB). */
export interface LimitField {
  key: LimitKey
  /** Translation key of the label. */
  label: string
  unit: 'GB' | 'cores' | 'files' | 'MB/s'
  factor: number
  /** Whole numbers only after the conversion (CPU keeps decimals). */
  whole: boolean
  /** Memory has no "No limit". */
  canBeUnlimited: boolean
  advanced: boolean
}

const MB = 1024 * 1024
/** Backend rule (`UpdateProjectLimitsRequest`): a manual value is 1 to 2147483647 stored units, CPU at most 1024 cores. */
const MAX_STORED = 2_147_483_647
const MAX_CPU = 1024
/** Backend rule: CPU may be a fraction, from 0.01 cores. */
const MIN_CPU = 0.01
const LABEL = 'heading.instance.advanced.projectLimits.field'

export const LIMIT_FIELDS: LimitField[] = [
  { key: 'memory_limit', label: `${LABEL}.memory`, unit: 'GB', factor: 1024, whole: true, canBeUnlimited: false, advanced: false },
  { key: 'cpu_limit', label: `${LABEL}.cpu`, unit: 'cores', factor: 1, whole: false, canBeUnlimited: true, advanced: false },
  { key: 'disk_space_limit', label: `${LABEL}.disk`, unit: 'GB', factor: 1024, whole: true, canBeUnlimited: true, advanced: false },
  { key: 'inodes_limit', label: `${LABEL}.inodes`, unit: 'files', factor: 1, whole: true, canBeUnlimited: true, advanced: true },
  { key: 'device_read_bps', label: `${LABEL}.diskRead`, unit: 'MB/s', factor: MB, whole: true, canBeUnlimited: true, advanced: true },
  { key: 'device_write_bps', label: `${LABEL}.diskWrite`, unit: 'MB/s', factor: MB, whole: true, canBeUnlimited: true, advanced: true },
]

/**
 * One field of the form. The raw text of the input is kept as typed, so "0." and "1,5" survive a re-render. The text the field opened
 * with and the stored value behind it are kept too: the text is rounded to two decimals, so an untouched field sends the stored value,
 * not the rounded text (1000 MB shows as 0.98 GB and must not come back as 1004 MB).
 */
export interface LimitEntry {
  raw: string
  unlimited: boolean
  initialRaw: string
  initialValue: number | null
}

export type LimitsForm = Record<LimitKey, LimitEntry>

export interface LimitError {
  kind: 'required' | 'min' | 'max'
  /** The bound, in the unit of the field (the memory minimum is in MB). */
  value?: number
  unit?: string
}

export type LimitErrors = Partial<Record<LimitKey, LimitError>>

/** Two decimals at most, no trailing zeros. */
export function roundUnit (value: number): number {
  return Math.round(value * 100) / 100
}

/** A ceiling of null, -1 or 0 means the plan sets no ceiling (0 and -1 both mean "no limit" in the Engine). */
export function ceilingOf (value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

/** The highest value the backend takes for a field, in stored units. */
function absoluteMax (field: LimitField): number {
  return field.key === 'cpu_limit' ? MAX_CPU : MAX_STORED
}

function minStored (field: LimitField): number {
  return field.key === 'cpu_limit' ? MIN_CPU : 1
}

/** The smallest value in a unit that shows it: 1 stored unit of disk is 1 MB, of speed 1 B/s (in GB or MB/s it would round to 0). */
function minError (field: LimitField): LimitError {
  if (field.key === 'cpu_limit') {
    return { kind: 'min', value: MIN_CPU, unit: field.unit }
  }
  if (field.unit === 'GB') {
    return { kind: 'min', value: 1, unit: 'MB' }
  }
  if (field.unit === 'MB/s') {
    return { kind: 'min', value: 1, unit: 'B/s' }
  }
  return { kind: 'min', value: 1, unit: field.unit }
}

/** "No limit" is `-1`, but old data may hold `0` or null for it: all three are the same. */
function isUnlimitedValue (value: number | null | undefined): boolean {
  return value === null || value === undefined || value <= 0
}

/**
 * Whether a save changed a limit that needs a rebuild. Only memory on a container (DinD) project applies at once; the other five limits,
 * and memory on a classic project, apply at the next rebuild. A limit that moved from `0` to `-1` is no change.
 */
export function needsRebuild (before: ProjectLimitValues, body: ProjectLimitsBody, isContainer: boolean): boolean {
  return LIMIT_FIELDS.some(field => {
    if (field.key === 'memory_limit' && isContainer) {
      return false
    }
    const old = before[field.key]
    const next = body[field.key]
    return isUnlimitedValue(old) && isUnlimitedValue(next) ? false : old !== next
  })
}

/** Lowest memory in MB: the Engine wants 256 MB for a container project. */
export function memoryMinimum (isContainer: boolean): number {
  return isContainer ? 256 : 6
}

/**
 * Stored values to form text. `-1` (and not set, for the fields that can be unlimited) is "No limit". A plan ceiling does not allow
 * "No limit", so such a field opens at the ceiling instead; otherwise the locked checkbox would send `-1` on every Save.
 */
export function toForm (limits: ProjectLimitValues, ceilings?: ProjectLimitValues): LimitsForm {
  const form = {} as LimitsForm
  for (const field of LIMIT_FIELDS) {
    const value = limits[field.key]
    const ceiling = ceilingOf(ceilings?.[field.key])
    let unlimited = field.canBeUnlimited && isUnlimitedValue(value)
    let start = typeof value === 'number' && value > 0 ? value : null
    if (unlimited && ceiling !== null) {
      unlimited = false
      start = ceiling
    }
    const raw = unlimited || start === null ? '' : String(roundUnit(start / field.factor))
    form[field.key] = { raw, unlimited, initialRaw: raw, initialValue: unlimited ? null : start }
  }
  return form
}

// Plain decimal text only: `Infinity`, `1e400` or `0x10` would pass `Number()`, and Infinity is sent as `null`, which clears the limit.
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

/** Typed text to a number in typed units, or NaN for an empty or unreadable text. */
function parse (raw: string): number {
  const text = raw.trim().replace(',', '.')
  if (!DECIMAL.test(text)) {
    return Number.NaN
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : Number.NaN
}

/**
 * The stored value of a field that is not "No limit". An untouched field keeps the value it opened with. A typed value that matches
 * the ceiling as the hint shows it ("2" GB against 2047 MB) means the ceiling, so it is not refused for the rounding of the hint.
 */
function stored (field: LimitField, entry: LimitEntry, ceiling: number | null): number {
  if (entry.raw === entry.initialRaw && entry.initialValue !== null) {
    return entry.initialValue
  }
  const typed = parse(entry.raw)
  const value = field.whole ? Math.round(typed * field.factor) : typed * field.factor
  if (ceiling !== null && value > ceiling && roundUnit(typed) <= roundUnit(ceiling / field.factor)) {
    return ceiling
  }
  return value
}

/** The request body: all six keys in stored units, `-1` for "No limit". Call it after `validateForm` found no error. */
export function toBody (form: LimitsForm, ceilings: ProjectLimitValues): ProjectLimitsBody {
  const body = {} as ProjectLimitsBody
  for (const field of LIMIT_FIELDS) {
    const entry = form[field.key]
    body[field.key] = field.canBeUnlimited && entry.unlimited ? -1 : stored(field, entry, ceilingOf(ceilings[field.key]))
  }
  return body
}

/**
 * Client rules: a value is required, memory is at least 6 MB (256 for a container project), CPU is at least 0.01 cores, the others are at least 1 stored unit, and none is
 * above the backend maximum (CPU 1024 cores) or a numeric plan ceiling. The server checks the same again and the Engine checks the server bounds.
 */
export function validateForm (form: LimitsForm, ceilings: ProjectLimitValues, isContainer: boolean): LimitErrors {
  const errors: LimitErrors = {}
  for (const field of LIMIT_FIELDS) {
    const entry = form[field.key]
    if (field.canBeUnlimited && entry.unlimited) {
      continue
    }
    if (Number.isNaN(parse(entry.raw))) {
      errors[field.key] = { kind: 'required' }
      continue
    }
    const ceiling = ceilingOf(ceilings[field.key])
    const value = stored(field, entry, ceiling)
    const max = ceiling === null ? absoluteMax(field) : Math.min(ceiling, absoluteMax(field))
    if (field.key === 'memory_limit' && value < memoryMinimum(isContainer)) {
      errors[field.key] = { kind: 'min', value: memoryMinimum(isContainer), unit: 'MB' }
    } else if (value < minStored(field)) {
      errors[field.key] = minError(field)
    } else if (value > max) {
      errors[field.key] = { kind: 'max', value: roundUnit(max / field.factor), unit: field.unit }
    }
  }
  return errors
}
