/**
 * The popup check of the SSO flows: `window.open` answered nothing, or a closed window. A browser
 * blocks a window opened after an `await`, once the click gesture has expired (Safari, mobile), so a caller that needs the window to
 * open offers a button as the fallback.
 */
export function popupBlocked (opened: Window | null): boolean {
  return !opened || opened.closed || opened.closed === undefined
}
