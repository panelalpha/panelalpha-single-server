import type { SharedAccessEntry } from '@/entities/project/instance-resource'
import type {
  InvitationSuggestion,
  SharedAccessInviteRequest,
  SharedAccessUpdateUser,
  WordpressUser,
} from '@/entities/project/share-instance.api'
import { PRIVILEGES } from '@/entities/privileges/privileges'
import { fromNow } from '@/shared/time/from-now'

// The logic of the share dialog that needs no component state: the user list of one or several instances, the SSO rules and the requests of an invite and of a save.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** The "all users" option of the "Login as" dropdowns. */
export const ALL_WORDPRESS_USERS_KEY = 0

export interface ShareRole {
  /** An i18n key the dropdown translates (`SelectDropdown`, `rawItemText` unset). */
  text: string
  key: string
  tooltip: string
}

export function buildRoles (t: Translate): ShareRole[] {
  return [
    { text: 'sharedAccess.role.viewOnly', key: 'view_only', tooltip: t('tooltip.instance.sharedAccess.role.viewOnly') },
    { text: 'sharedAccess.role.viewAndSso', key: 'view_and_sso', tooltip: t('tooltip.instance.sharedAccess.role.viewAndSso') },
    { text: 'sharedAccess.role.developer', key: 'developer', tooltip: t('tooltip.instance.sharedAccess.role.developer') },
    { text: 'sharedAccess.role.fullAccess', key: 'full_access', tooltip: t('tooltip.instance.sharedAccess.role.fullAccess') },
    { text: 'sharedAccess.role.custom', key: 'custom', tooltip: t('tooltip.instance.sharedAccess.role.custom') },
  ]
}

/** The roles that can open the site as a WordPress user. */
export function roleHasSso (role: string | undefined, customPrivileges: readonly string[] | null | undefined = []): boolean {
  if (['view_and_sso', 'developer', 'full_access'].includes(role as string)) {
    return true
  }
  if (role === 'custom') {
    return (customPrivileges || []).includes(PRIVILEGES.CREATE_SSO_LINK)
  }
  return false
}

export function normalizeWordpressUserId (value: unknown): number | null {
  if ([null, undefined, ''].includes(value as null)) {
    return null
  }
  const id = Number(value)
  return Number.isNaN(id) ? null : id
}

/** `moment(value).fromNow()`: `undefined` is now, `null` is an invalid date. */
export function momentFromNow (value: string | null | undefined): string {
  if (value === undefined) {
    return fromNow(new Date())
  }
  if (value === null) {
    return 'Invalid date'
  }
  return fromNow(value)
}

/** One row of the access table: the merged view of a user over one or several instances. */
export interface ShareUser {
  name: string
  email: string
  /** `mixed` when the instances disagree, or when the user is missing on some of them. */
  role: string
  customPrivileges: string[]
  wordpress_user_id: number | null
  invitationPending: boolean
  invited_at?: string | null
  invited_at_text: string
  notification_sent_at?: string | null
  notification_sent_at_text: string
  resend_available_at?: string | null
  /** Multi-instance mode only. */
  instancesIds?: number[]
}

export interface ShareInstanceLike {
  id: number
  title?: string
  sharedAccess?: SharedAccessEntry[]
  subInstances?: unknown[]
  privileges?: readonly string[]
  owner?: { name?: string, email?: string } | null
}

/** The users of a single instance. */
export function assignedUsersOf (instance: Pick<ShareInstanceLike, 'sharedAccess'>): ShareUser[] {
  return (instance.sharedAccess ?? []).map(user => ({
    name: user.name || user.email,
    email: user.email,
    role: user.role,
    customPrivileges: user.custom_privileges || [],
    wordpress_user_id: normalizeWordpressUserId(user.wordpress_user_id),
    invitationPending: !user.accepted_at,
    invited_at_text: momentFromNow(user.invited_at),
    notification_sent_at_text: momentFromNow(user.notification_sent_at),
    resend_available_at: user.resend_available_at,
  }))
}

/** The users of a selection: users merged by e-mail, `mixed` where the instances differ. */
export function assignedUsersOfMany (instances: ReadonlyArray<ShareInstanceLike>): ShareUser[] {
  const users = new Map<string, ShareUser>()
  for (const instance of instances) {
    for (const user of instance.sharedAccess ?? []) {
      const existing = users.get(user.email)
      if (existing) {
        if (existing.role !== user.role) {
          existing.role = 'mixed'
        }
        existing.customPrivileges = []
        if (!existing.invitationPending) {
          existing.invitationPending = !user.accepted_at
        }
        if ((user.invited_at as string) > (existing.invited_at as string)) {
          existing.invited_at = user.invited_at
          existing.invited_at_text = momentFromNow(user.invited_at)
        }
        if ((user.notification_sent_at as string) > (existing.notification_sent_at as string)) {
          existing.notification_sent_at = user.notification_sent_at
          existing.notification_sent_at_text = momentFromNow(user.notification_sent_at)
        }
        if ((user.resend_available_at as string) > (existing.resend_available_at as string)) {
          existing.resend_available_at = user.resend_available_at
        }
        existing.instancesIds!.push(instance.id)
        continue
      }
      users.set(user.email, {
        name: user.name || user.email,
        email: user.email,
        role: user.role,
        customPrivileges: user.custom_privileges || [],
        wordpress_user_id: normalizeWordpressUserId(user.wordpress_user_id),
        invitationPending: !user.accepted_at,
        invited_at: user.invited_at,
        invited_at_text: momentFromNow(user.invited_at),
        notification_sent_at: user.notification_sent_at,
        notification_sent_at_text: momentFromNow(user.notification_sent_at),
        resend_available_at: user.resend_available_at,
        instancesIds: [instance.id],
      })
    }
  }
  for (const user of users.values()) {
    if (user.instancesIds!.length !== instances.length) {
      user.role = 'mixed'
    }
  }
  return [...users.values()]
}

/** The suggestions that are not on the list yet. */
export function filterSuggestions (suggestions: InvitationSuggestion[], assigned: ReadonlyArray<{ email: string }>): InvitationSuggestion[] {
  return suggestions.filter(item => !assigned.some(user => item.email === user.email))
}

/** A case-insensitive match on `email + name`. */
export function suggestionMatches (item: { email: string, name?: string }, queryText: string): boolean {
  return `${item.email}${item.name}`.toLocaleLowerCase().includes(queryText.toLocaleLowerCase())
}

/**
 * An object (a suggestion) is always correct, a typed string must look like an address. The legacy pattern
 * `/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/` backtracks exponentially; this one accepts the same strings (differential check
 * on 400k random strings, no difference): a separator is mandatory between word groups and the last group is `.` plus 2-3 characters.
 */
export function isEmailCorrect (item: unknown): boolean {
  if (typeof item === 'object') {
    return true
  }
  return /^\w+(?:[.-]\w+)*@\w+(?:[.-]\w+)*\.\w{2,3}$/.test(item as string)
}

export interface WordpressUserDropdownItem {
  text: string
  key: number
  tooltip: string
}

/** "All users" first, then one item per WordPress user. */
export function buildWordpressUserDropdownItems (users: WordpressUser[], t: Translate): WordpressUserDropdownItem[] {
  const items: WordpressUserDropdownItem[] = [
    {
      text: t('form.option.sharedAccess.loginAs.allUsers'),
      key: ALL_WORDPRESS_USERS_KEY,
      tooltip: t('tooltip.sharedAccess.loginAs.allUsers'),
    },
  ]
  for (const user of users) {
    const email = user.user_email || user.email || ''
    const displayName = user.display_name || email
    items.push({
      text: displayName,
      key: Number(user.id),
      tooltip: email ? `${displayName} - ${email}` : displayName,
    })
  }
  return items
}

/** A value of a "Login as" dropdown (the item, the key or nothing) as a WordPress user id (`null` for "All users"). */
export function wordpressUserIdOf (value: unknown): number | null {
  if ([null, undefined, ''].includes(value as null)) {
    return null
  }
  const id = typeof value === 'object' ? (value as { key: number }).key : value
  return Number(id) === ALL_WORDPRESS_USERS_KEY ? null : Number(id)
}

/** The invite request. `wordpress_user_id` is only sent for one address with an SSO role. */
export function buildInviteRequest (input: {
  role: string
  customPrivileges: string[]
  users: ReadonlyArray<string | { email?: string }>
  applyToStagings: boolean
  wordpressUserId: number | null
}): SharedAccessInviteRequest {
  const request: SharedAccessInviteRequest = { role: input.role, emails: [] }
  if (input.role === 'custom') {
    request.custom_privileges = input.customPrivileges
  }
  request.emails = input.users.map(item => (typeof item === 'object' && item.email ? item.email : item) as string)
  request.apply_to_stagings = input.applyToStagings
  if (roleHasSso(input.role, input.customPrivileges) && request.emails.length === 1) {
    request.wordpress_user_id = input.wordpressUserId == null ? null : input.wordpressUserId
  }
  return request
}

function updateUserOf (user: ShareUser, applyToStagings: boolean): SharedAccessUpdateUser {
  const updateUser: SharedAccessUpdateUser = {
    email: user.email,
    role: user.role,
    custom_privileges: user.customPrivileges,
    apply_to_stagings: applyToStagings,
  }
  if (roleHasSso(user.role, user.customPrivileges)) {
    updateUser.wordpress_user_id = user.wordpress_user_id ?? null
  }
  return updateUser
}

/** The two requests a save of one instance sends (an empty `users` list is not sent). */
export function buildSingleSaveRequests (
  pendingChanges: Record<string, ShareUser>,
  pendingRemove: Record<string, ShareUser>,
  applyToStagings: boolean,
): { update: SharedAccessUpdateUser[], remove: Array<{ email: string, apply_to_stagings: boolean }> } {
  return {
    update: Object.values(pendingChanges).map(user => updateUserOf(user, applyToStagings)),
    remove: Object.values(pendingRemove).map(user => ({ email: user.email, apply_to_stagings: applyToStagings })),
  }
}

export type MultiSaveOperation
  = | { kind: 'invite', instanceId: number, request: SharedAccessInviteRequest }
    | { kind: 'update', instanceId: number, users: SharedAccessUpdateUser[] }
    | { kind: 'remove', instanceId: number, users: Array<{ email: string, apply_to_stagings: boolean }> }

/**
 * Per instance, a changed user missing there is invited and the others are updated in one
 * request; then per instance the removed users it has are deleted. A user without `instancesIds` counts as missing everywhere.
 */
export function buildMultiSavePlan (
  instances: ReadonlyArray<{ id: number }>,
  pendingChanges: Record<string, ShareUser>,
  pendingRemove: Record<string, ShareUser>,
  applyToStagings: boolean,
): MultiSaveOperation[] {
  const operations: MultiSaveOperation[] = []

  if (Object.keys(pendingChanges).length > 0) {
    for (const instance of instances) {
      const users: SharedAccessUpdateUser[] = []
      for (const user of Object.values(pendingChanges)) {
        if (!user.instancesIds!.includes(instance.id)) {
          const request: SharedAccessInviteRequest = {
            emails: [user.email],
            role: user.role,
            custom_privileges: user.customPrivileges,
            apply_to_stagings: applyToStagings,
          }
          if (roleHasSso(user.role, user.customPrivileges)) {
            request.wordpress_user_id = user.wordpress_user_id ?? null
          }
          operations.push({ kind: 'invite', instanceId: instance.id, request })
          continue
        }
        users.push(updateUserOf(user, applyToStagings))
      }
      if (users.length > 0) {
        operations.push({ kind: 'update', instanceId: instance.id, users })
      }
    }
  }

  if (Object.keys(pendingRemove).length > 0) {
    for (const instance of instances) {
      const users = Object.values(pendingRemove)
        .filter(user => user.instancesIds!.includes(instance.id))
        .map(user => ({ email: user.email, apply_to_stagings: applyToStagings }))
      if (users.length > 0) {
        operations.push({ kind: 'remove', instanceId: instance.id, users })
      }
    }
  }

  return operations
}

/** The "apply to stagings" checkbox shows only when an instance has a staging. */
export function hasStagings (instance: ShareInstanceLike, many: ReadonlyArray<ShareInstanceLike>): boolean {
  if (many.length > 0) {
    return many.some(item => (item.subInstances?.length ?? 0) > 0)
  }
  if (instance.id !== 0) {
    return (instance.subInstances?.length ?? 0) > 0
  }
  return false
}
