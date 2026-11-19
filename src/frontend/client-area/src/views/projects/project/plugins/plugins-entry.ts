import type { InstanceResource } from '@/entities/project/instance-resource'

// Guard of the Plugins route. Legacy has no guard: the Plugins tab is hidden without
// `wordpress.manage_plugins` (`InstanceTopBarTabs.vue`), but the URL still opened the page and the 403 on the list ended in an empty
// state. The instance comes from the frame GET, so the check runs in the view, not in `beforeEnter`.

/** Where a visitor without the privilege goes (the general page of the same project), or `null` when the page may render. */
export function resolvePluginsEntry (
  instance: Pick<InstanceResource, 'id' | 'hasManagePluginsPrivilege'>,
  preferredBase: '/projects' | '/instances',
): string | null {
  return instance.hasManagePluginsPrivilege() ? null : `${preferredBase}/${String(instance.id)}/general`
}
