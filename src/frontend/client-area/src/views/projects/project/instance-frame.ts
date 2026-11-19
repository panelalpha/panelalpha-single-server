import type { InstanceResource } from '@/entities/project/instance-resource'

/** The alert the frame shows before it leaves the page. */
export type FrameAlertKey = 'message.serviceSuspended' | 'message.instanceInDiagnosticMode'

export interface FrameRedirect {
  /** The list the frame leaves to: `/projects` under single server, `/instances` otherwise. */
  path: '/projects' | '/instances'
  alertKey?: FrameAlertKey
}

/**
 * The checks after the GET, in their order: inactive → list; suspended or cancelled service → list with
 * an alert; diagnostic mode → list with an alert. Returns `null` when the page may render.
 */
export function resolveFrameRedirect (
  instance: Pick<InstanceResource, 'isActive' | 'service_status' | 'diagnostic_mode'>,
  preferredBase: '/projects' | '/instances',
): FrameRedirect | null {
  if (!instance.isActive) {
    return { path: preferredBase }
  }
  if (instance.service_status === 'suspended' || instance.service_status === 'cancelled') {
    return { path: preferredBase, alertKey: 'message.serviceSuspended' }
  }
  if (instance.diagnostic_mode) {
    return { path: preferredBase, alertKey: 'message.instanceInDiagnosticMode' }
  }
  return null
}

/**
 * Pushes of a failed GET of the frame, in order: legacy `fetch` swallows the error and pushes the 404 page, then `mountInstancePage`
 * sees the empty instance as not active and replaces the 404 page with the list.
 */
export function frameNotFoundPushes (preferredBase: '/projects' | '/instances'): ['/page-not-found', '/projects' | '/instances'] {
  return ['/page-not-found', preferredBase]
}
