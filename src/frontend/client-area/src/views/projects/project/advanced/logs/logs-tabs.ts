import type { InstanceResource } from '@/entities/project/instance-resource'
import { isContainerProject } from '@/entities/project/container-project'

// The tabs follow the app-lite order: instance, deploy, wordpress, php, webserver. App has no `custom` type, so its deploy tab never appears.

export type LogsTab = 'instance' | 'deploy' | 'wordpress' | 'php' | 'webserver'

/** With the container test the backend uses: a classic PHP hosting
 * project is `custom` too and has no deploy log. */
export function canViewDeployLogs (instance: InstanceResource): boolean {
  return isContainerProject(instance) && instance.hasViewLogsPrivilege()
}

/** The tabs the privileges allow, in the order of the tab strip. */
export function availableLogTabs (instance: InstanceResource): LogsTab[] {
  const tabs: LogsTab[] = []
  if (instance.hasViewLogsPrivilege()) {
    tabs.push('instance')
  }
  if (canViewDeployLogs(instance)) {
    tabs.push('deploy')
  }
  if (instance.hasWordPressViewLogsPrivilege()) {
    tabs.push('wordpress')
  }
  if (instance.hasViewPhpLogsPrivilege()) {
    tabs.push('php')
  }
  if (instance.hasViewWebserverLogsPrivilege()) {
    tabs.push('webserver')
  }
  return tabs
}

export interface InitialLoads {
  /** The first tab: its own load runs first (wordpress and php load their text, webserver awaits its file list). */
  first: LogsTab | null
  /** The loads that legacy `mounted` starts after `first`, in its order: instance, deploy, then the webserver file list. */
  background: LogsTab[]
}

const UNCONDITIONAL_MOUNT_LOADS: ReadonlySet<LogsTab> = new Set(['instance', 'deploy', 'webserver'])

/**
 * `background` lists the loads legacy starts without a tab
 * check (instance list, deploy list, webserver file list), skipping `first` so nothing loads twice. The `tab` watch must not fire at
 * init: these loads run once from `mounted`, and the watch only handles later entries into a tab.
 */
export function initialLoads (tabs: LogsTab[]): InitialLoads {
  const first = tabs[0] ?? null
  const background = tabs.filter(tab => tab !== first && UNCONDITIONAL_MOUNT_LOADS.has(tab))
  return { first, background }
}
