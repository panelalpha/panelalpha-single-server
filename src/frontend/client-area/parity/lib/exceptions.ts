import { existsSync, readFileSync } from 'node:fs'

export interface ParityException {
  state: string
  variant?: string
  probe?: string
  /** A computed-style property, or `pixel` / `missing`. */
  property?: string
  /** Pixel exceptions only: the highest diff ratio (0–1) the exception covers; a larger ratio stays failing. */
  maxRatio?: number
  reason: string
  approvedBy: string
  date: string
}

/** One failing comparison item. Pixel failures have no probe and the property `pixel`. */
export interface FailingItem {
  probe?: string
  property: string
  /** The pixel diff ratio (0–1), set on `pixel` items. */
  ratio?: number
}

const REQUIRED_FIELDS = ['state', 'reason', 'approvedBy', 'date'] as const

export function parseExceptions (json: unknown): ParityException[] {
  if (!Array.isArray(json)) {
    throw new TypeError('exceptions.json must be an array')
  }
  return json.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError(`exceptions.json[${index}] must be an object`)
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof (entry as Record<string, unknown>)[field] !== 'string' || (entry as Record<string, string>)[field] === '') {
        throw new TypeError(`exceptions.json[${index}] is missing "${field}"`)
      }
    }
    const maxRatio = (entry as Record<string, unknown>).maxRatio
    if (maxRatio !== undefined && typeof maxRatio !== 'number') {
      throw new TypeError(`exceptions.json[${index}] has a non-numeric "maxRatio"`)
    }
    return entry as ParityException
  })
}

/** Reads `exceptions.json`; a missing file means no exceptions. The file is never written. */
export function loadExceptions (path: string): ParityException[] {
  if (!existsSync(path)) {
    return []
  }
  return parseExceptions(JSON.parse(readFileSync(path, 'utf8')))
}

function matches (pattern: string | undefined, value: string | undefined): boolean {
  return pattern === undefined || pattern === '*' || (value !== undefined && pattern === value)
}

/** `state` and `variant` accept `*`; an omitted probe or property matches any; `maxRatio` caps the item's ratio. */
export function findException (exceptions: ParityException[], state: string, variant: string, item: FailingItem): ParityException | undefined {
  return exceptions.find(exception =>
    matches(exception.state, state)
    && matches(exception.variant, variant)
    && (exception.probe === undefined || exception.probe === item.probe)
    && (exception.property === undefined || exception.property === item.property)
    && (exception.maxRatio === undefined || (item.ratio !== undefined && item.ratio <= exception.maxRatio)),
  )
}
