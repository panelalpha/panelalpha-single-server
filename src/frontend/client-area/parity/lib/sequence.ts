/**
 * Picks the element for the n-th call (0-based) of a handler that may be a sequence:
 * the first call gets the first element, each next call the next one, the last element repeats.
 * A single value answers every call.
 */
export function pickFromSequence<T> (handler: T | readonly T[], callIndex: number): T {
  if (!Array.isArray(handler)) {
    return handler as T
  }
  const sequence = handler as readonly T[]
  if (sequence.length === 0) {
    throw new Error('Harness error: empty handler sequence')
  }
  return sequence[Math.min(callIndex, sequence.length - 1)]!
}
