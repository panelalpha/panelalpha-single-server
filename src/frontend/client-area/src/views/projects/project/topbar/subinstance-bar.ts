import type { InstanceResource } from '@/entities/project/instance-resource'

// Pure rules of the subinstance bar.

/** The live instance of a staging copy, else the instance itself. */
export function barParent (instance: InstanceResource): InstanceResource | null {
  return instance.staging ? instance.parentInstance : instance
}

/** A staging copy shows only itself, a live instance shows its staging copies. */
export function barSubinstances (instance: InstanceResource): InstanceResource[] {
  return instance.staging ? [instance] : instance.subInstances
}

/** An install in progress or failed, else no state. */
export type TabState = 'error' | 'in_progress' | false

export function tabState (subinstance: Pick<InstanceResource, 'hasInstallStatus' | 'hasInstallFailed'>): TabState {
  if (!subinstance.hasInstallStatus()) {
    return false
  }
  return subinstance.hasInstallFailed() ? 'error' : 'in_progress'
}

/** Runs only for a tab without state: a tab in progress or failed does not switch. */
export function canSwitchTo (state: TabState): boolean {
  return state === false
}
