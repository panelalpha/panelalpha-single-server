/** `window.location.assign` behind a function, so the view test can mock the navigation away from the SPA. */
export function assignLocation (url: string): void {
  window.location.assign(url)
}
