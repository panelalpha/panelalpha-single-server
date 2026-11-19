import { expect } from 'vitest'

/** Assert every legacy class is present; failure lists the missing ones. */
export function expectLegacyClasses (element: Element, classes: string[]): void {
  const missing = classes.filter(name => !element.classList.contains(name))
  if (missing.length > 0) {
    throw new Error(`missing legacy classes: ${missing.join(', ')}`)
  }
  expect(missing).toEqual([])
}
