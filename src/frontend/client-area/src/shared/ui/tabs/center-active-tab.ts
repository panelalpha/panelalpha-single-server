// Legacy V2 `v-tabs center-active` scrolled the selected tab to the middle of the strip on mount (legacy mobile sub-tabs:
// `sidebar-active.x` 102.5px). V4 `center-active` only scrolls from its own watch, which does not run for the tab that is already
// selected on first render, so the strip stays at the start and the active tab is off screen (497px). This hook centres the
// `.v-tab--selected` tab once after mount; later selections stay on V4's watch. Bind it as `@vue:mounted` next to `center-active`:
// a directive does not reach the element of `v-tabs` (Vue drops directives on a component whose root is not an element), and the
// hook leaves the `v-tabs` element and its scoped-style attributes unchanged (decision C, 2026-10-09).

/** Centres the selected tab of a tab strip in its scroll container (`.v-slide-group__container`). */
export function centerSelectedTab (root: HTMLElement): void {
  const container = root.querySelector<HTMLElement>('.v-slide-group__container')
  const selected = root.querySelector<HTMLElement>('.v-tab--selected')
  if (!container || !selected) {
    return
  }

  const maxScroll = container.scrollWidth - container.clientWidth
  if (maxScroll <= 0) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const selectedRect = selected.getBoundingClientRect()
  const offset = selectedRect.left + selectedRect.width / 2 - (containerRect.left + containerRect.width / 2)
  container.scrollLeft = Math.min(Math.max(container.scrollLeft + offset, 0), maxScroll)
}

/** `@vue:mounted` handler of a `v-tabs center-active`. `v-tabs` renders a fragment, so `vnode.el` is its leading text anchor. */
export function centerActiveTabOnMount (vnode: { el: unknown }): void {
  let node = vnode.el as ChildNode | null | undefined
  while (node && !(node instanceof HTMLElement)) {
    node = node.nextSibling
  }
  if (!(node instanceof HTMLElement)) {
    return
  }
  const root = node
  requestAnimationFrame(() => {
    centerSelectedTab(root)
  })
}
