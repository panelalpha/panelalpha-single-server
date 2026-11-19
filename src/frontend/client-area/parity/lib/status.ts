import type { StyleDelta, TextDelta } from './compare'
import type { FailingItem, ParityException } from './exceptions'
import { findException } from './exceptions'

export type ParityStatus = 'PASS' | 'ACCEPTED' | 'FAIL'

export interface ExceptionApplied {
  item: FailingItem
  exception: ParityException
}

export interface ParityResult {
  runId: string
  commit: string
  state: string
  /** Legacy target the state was measured against; absent in results written before targets existed (read as `app`). */
  target?: 'app' | 'lite'
  variant: string
  pixelRatio: number
  sizes: { legacy: { width: number, height: number }, next: { width: number, height: number } }
  homeCount: { legacy: number, next: number }
  /** `cache` when the legacy side came from the legacy capture cache; absent in results written before the cache existed. */
  legacySource?: 'cache' | 'live'
  styleDeltas: StyleDelta[]
  textDeltas: TextDelta[]
  status: ParityStatus
  exceptionsApplied: ExceptionApplied[]
  /** Font files each app loaded; evidence for the report header. */
  fonts: { legacy: string[], next: string[] }
}

/**
 * PASS: nothing failing. ACCEPTED: every failing item is matched by an exception. FAIL otherwise.
 * Text deltas are never part of `failing`.
 */
export function deriveStatus (failing: FailingItem[], exceptions: ParityException[], state: string, variant: string): { status: ParityStatus, exceptionsApplied: ExceptionApplied[] } {
  if (failing.length === 0) {
    return { status: 'PASS', exceptionsApplied: [] }
  }
  const exceptionsApplied: ExceptionApplied[] = []
  for (const item of failing) {
    const exception = findException(exceptions, state, variant, item)
    if (exception) {
      exceptionsApplied.push({ item, exception })
    }
  }
  return { status: exceptionsApplied.length === failing.length ? 'ACCEPTED' : 'FAIL', exceptionsApplied }
}
