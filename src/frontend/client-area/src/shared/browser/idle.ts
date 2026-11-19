/**
 * Runs `callback` when the browser is idle, at the latest after `timeout` ms; a timer where `requestIdleCallback` is missing
 * (Safari). Returns a function that cancels a callback that has not run yet.
 */
export function runWhenIdle (callback: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback(), { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(callback, Math.min(timeout, 200))
  return () => clearTimeout(id)
}
