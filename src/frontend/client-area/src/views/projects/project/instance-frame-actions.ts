import type { InstanceResource, PlanSettings } from '@/entities/project/instance-resource'
import { versionGreater } from '@/shared/version/compare-versions'

// Pure rules of the instance top bar actions (the top bar `v-if`s and the `$root` handlers of the frame).
// The frame wires the actions to the modal host; these functions decide what shows and what happens after.

export interface WordpressVersions {
  wordpress?: string | null
  wordpress_available?: string | null
}

/** `status.wordpress_available > status.wordpress` (the update button), compared as numbers. */
export function hasWordPressUpdate (status: WordpressVersions | null | undefined): boolean {
  if (!status) {
    return false
  }
  return versionGreater(status.wordpress_available, status.wordpress)
}

/** Copy: not on a narrow screen, the plan allows it and the privilege is there. */
export function canShowCopy (input: { lgAndDown: boolean, planSettings: PlanSettings | null | undefined, hasPrivilege: boolean }): boolean {
  return !input.lgAndDown && input.planSettings?.copy_instance_allowed === true && input.hasPrivilege
}

/** A project without `type` is WordPress, only `custom` is not. */
export function isWordpressProject (type: string | undefined): boolean {
  return (type || 'wordpress') !== 'custom'
}

/**
 * Admin Area (app-lite): replaces WP Admin and Log In. Only for a project whose
 * engine supports admin SSO; a WordPress project also needs the SSO-link privilege, a custom one the (general) users privilege.
 */
export function canShowAdminArea (input: { supportsAdminSso: boolean | undefined, isWordpress: boolean, hasCreateSsoLinkPrivilege: boolean, hasManageUsersPrivilege: boolean }): boolean {
  if (!input.supportsAdminSso) {
    return false
  }
  return input.isWordpress ? input.hasCreateSsoLinkPrivilege : input.hasManageUsersPrivilege
}

/**
 * The label and icon of the admin SSO button. App-lite says "Admin Area" for both kinds; a WordPress project says "WP Admin" (it opens
 * wp-admin, and "Admin Area" is also the name of the panel's own admin area), a custom app keeps "Admin Area".
 */
export function adminSsoButton (isWordpress: boolean): { labelKey: 'button.wpAdmin' | 'button.adminArea', icon: '$wordpress' | '$settings3' } {
  return isWordpress
    ? { labelKey: 'button.wpAdmin', icon: '$wordpress' }
    : { labelKey: 'button.adminArea', icon: '$settings3' }
}

/** Push to live is the staging copy's button (`subinstanceLabel === 'staging'`). */
export function canShowPushToLive (subinstanceLabel: 'staging' | 'live', hasPrivilege: boolean): boolean {
  return subinstanceLabel === 'staging' && hasPrivilege
}

/** What the frame does after a delete: a staging copy leaves its live parent, anything else goes to the root (`/`). */
export type DeleteFollowUp = { kind: 'to-parent', parent: InstanceResource } | { kind: 'to-root' }

/**
 * A staging copy is removed from its parent and the page moves
 * to the parent (`instance-changed`); a live instance sends the user to `/`. A staging copy without its parent (not loaded) goes to
 * `/` as well, instead of the legacy crash.
 */
export function deleteFollowUp (instance: Pick<InstanceResource, 'staging' | 'parentInstance'>): DeleteFollowUp {
  if (instance.staging && instance.parentInstance) {
    return { kind: 'to-parent', parent: instance.parentInstance }
  }
  return { kind: 'to-root' }
}

export type StatusKey = 'update' | 'push_to_live' | 'pull_from_staging' | 'push_to_staging'

export interface StatusPatch {
  id: number
  key: StatusKey
  value: 'in_progress'
}

/** A WordPress update started: the row and the page show it as running (`instance-update-in-progress`). */
export function updateStatusPatches (id: number): StatusPatch[] {
  return [{ id, key: 'update', value: 'in_progress' }]
}

/**
 * A push to live started (`instance-push-to-live-in-progress`): the staging copy pushes, its live
 * parent pulls. Without a loaded parent only the staging copy is marked.
 */
export function pushStatusPatches (staging: { id: number, parentInstance?: { id: number } | null }): StatusPatch[] {
  const patches: StatusPatch[] = [{ id: staging.id, key: 'push_to_live', value: 'in_progress' }]
  if (staging.parentInstance) {
    patches.push({ id: staging.parentInstance.id, key: 'pull_from_staging', value: 'in_progress' })
  }
  return patches
}

/**
 * A push to staging started (`instance-push-to-staging-in-progress`): only the live
 * project is marked, the staging copy gets no status.
 */
export function pushToStagingStatusPatches (live: { id: number }): StatusPatch[] {
  return [{ id: live.id, key: 'push_to_staging', value: 'in_progress' }]
}

/** Leave-page message while a push to live is loading (no i18n key exists for it). */
export const PUSH_LEAVE_MESSAGE = 'Action in progress. Leaving the page may cause the process to fail.'
