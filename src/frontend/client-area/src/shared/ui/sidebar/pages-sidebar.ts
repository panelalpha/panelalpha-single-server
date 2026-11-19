// Pure logic of the page sidebar pattern (`PagesSidebar.vue`): the items the screens pass in, the
// groups that render, the flat tab list and the selected tab of a strip without routes.

/** One entry of the list and of the tab strip. `to` makes it a route link; without `to` it is selected by `active` and emits `select`. */
export interface PagesSidebarItem {
  key: string
  /** Already translated. */
  title: string
  to?: string
  active?: boolean
  /** Name of the red dot after the title, used in its test id (`<prefix>-sidebar-<dot>-dot`); no dot when missing. */
  dot?: string
}

/** A block of the desktop list with an optional subheader. The tab strip shows the items of every group in order. */
export interface PagesSidebarGroup {
  key: string
  title?: string
  items: PagesSidebarItem[]
}

/** The groups that render: a group without items has no subheader and no block (legacy hosting Email group). */
export function visibleGroups (groups: readonly PagesSidebarGroup[]): PagesSidebarGroup[] {
  return groups.filter(group => group.items.length > 0)
}

/** The tab strip: the items of the visible groups, in order. */
export function flatItems (groups: readonly PagesSidebarGroup[]): PagesSidebarItem[] {
  return visibleGroups(groups).flatMap(group => group.items)
}

/** Classes of a group subheader: 24px above it, except the first one when nothing renders above the groups. */
export function subheaderClass (index: number, hasContentBefore: boolean): string {
  return index === 0 && !hasContentBefore ? 'pl-0 p-4 mt-0 pb-3' : 'pl-0 p-4 mt-6 pb-3'
}

/** The selected tab of a strip without routes: the active item, else the first one. `undefined` for route links (the router selects). */
export function activeTabKey (items: readonly PagesSidebarItem[]): string | undefined {
  if (items.length === 0 || items.some(item => item.to !== undefined)) {
    return undefined
  }
  return (items.find(item => item.active === true) ?? items[0])?.key
}
