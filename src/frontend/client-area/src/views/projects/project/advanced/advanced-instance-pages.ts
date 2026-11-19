// The Advanced pages follow the sidebar's own list (Cloudflare and CDN follow the instance's privileges and flags, they are
// not hidden by the edition; the WordPress pages follow the project type the panel decided for it). A direct URL to a page the sidebar does
// not offer must not mount the page either: the page's GET answers 422/404 and shows an error (a WordPress-only page on a container project,
// `env-file` on a WordPress one). The sidebar's own list decides, so the two can never disagree.
import type { InstanceResource } from '@/entities/project/instance-resource'
import { resourceBaseFor } from './advanced-resource-base'
import { advancedSidebarItems } from './advanced-sidebar-items'
import { ADVANCED_HOSTING_SECTIONS } from './hosting-context/advanced-hosting-sections'

/** The last path segment of an Advanced route, or `null` (a trailing slash is allowed, deeper paths are not). */
export function advancedPageSegment (path: string | undefined): string | null {
  const match = /^\/(?:projects|instances)\/[^/]+\/advanced\/([^/]+)\/?$/.exec(path ?? '')
  return match ? match[1]! : null
}

/** The hosting sections are pages of the frame too, but they carry `meta.advancedHostingSection` and their own rule reads the same list. */
const HOSTING_SECTION_SEGMENTS: ReadonlySet<string> = new Set(ADVANCED_HOSTING_SECTIONS.map(section => section.path))

/**
 * The Details redirect for an Advanced page the sidebar does not offer, or `null` when it does (or the route is no page of the frame).
 * Every page the sidebar lists is decided here; the hosting sections keep `hiddenHostingSectionRedirect` and the hidden pages their own rule.
 */
export function hiddenInstancePageRedirect (
  path: string,
  id: string,
  instance: InstanceResource,
  singleServer: boolean,
): string | null {
  const segment = advancedPageSegment(path)
  if (segment === null || HOSTING_SECTION_SEGMENTS.has(segment)) {
    return null
  }
  const base = resourceBaseFor(path)
  const offered = advancedSidebarItems(instance, base, singleServer).some(item => item.key === segment)
  return offered ? null : `${base}/${id}/advanced/details`
}
