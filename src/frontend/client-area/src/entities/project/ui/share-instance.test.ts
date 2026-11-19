import type { SharedAccessEntry } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import {
  ALL_WORDPRESS_USERS_KEY,
  assignedUsersOf,
  assignedUsersOfMany,
  buildInviteRequest,
  buildMultiSavePlan,
  buildRoles,
  buildSingleSaveRequests,
  buildWordpressUserDropdownItems,
  filterSuggestions,
  hasStagings,
  isEmailCorrect,
  momentFromNow,
  normalizeWordpressUserId,
  roleHasSso,
  type ShareUser,
  suggestionMatches,
  wordpressUserIdOf,
} from './share-instance'

const t = (key: string) => key

function entry (email: string, role: string, extra: Partial<SharedAccessEntry> = {}): SharedAccessEntry {
  return { email, name: email.split('@', 1)[0], role, accepted_at: '2026-01-01T00:00:00.000Z', ...extra }
}

function user (email: string, role: string, extra: Partial<ShareUser> = {}): ShareUser {
  return {
    name: email,
    email,
    role,
    customPrivileges: [],
    wordpress_user_id: null,
    invitationPending: false,
    invited_at_text: '',
    notification_sent_at_text: '',
    ...extra,
  }
}

describe('roles and SSO', () => {
  it('lists the five roles with their i18n keys and tooltips', () => {
    expect(buildRoles(t).map(role => [role.key, role.text, role.tooltip])).toEqual([
      ['view_only', 'sharedAccess.role.viewOnly', 'tooltip.instance.sharedAccess.role.viewOnly'],
      ['view_and_sso', 'sharedAccess.role.viewAndSso', 'tooltip.instance.sharedAccess.role.viewAndSso'],
      ['developer', 'sharedAccess.role.developer', 'tooltip.instance.sharedAccess.role.developer'],
      ['full_access', 'sharedAccess.role.fullAccess', 'tooltip.instance.sharedAccess.role.fullAccess'],
      ['custom', 'sharedAccess.role.custom', 'tooltip.instance.sharedAccess.role.custom'],
    ])
  })

  it('gives SSO to three roles, and to custom only with the SSO privilege', () => {
    expect(roleHasSso('view_only')).toBe(false)
    expect(roleHasSso('view_and_sso')).toBe(true)
    expect(roleHasSso('developer')).toBe(true)
    expect(roleHasSso('full_access')).toBe(true)
    expect(roleHasSso('mixed')).toBe(false)
    expect(roleHasSso('custom', [])).toBe(false)
    expect(roleHasSso('custom', ['wordpress.create_sso_link'])).toBe(true)
    expect(roleHasSso('custom', null)).toBe(false)
  })

  it('normalizes a WordPress user id and reads the id of a dropdown value', () => {
    expect(normalizeWordpressUserId(null)).toBeNull()
    expect(normalizeWordpressUserId('')).toBeNull()
    expect(normalizeWordpressUserId('x')).toBeNull()
    expect(normalizeWordpressUserId('7')).toBe(7)

    expect(wordpressUserIdOf(null)).toBeNull()
    expect(wordpressUserIdOf('')).toBeNull()
    expect(wordpressUserIdOf(ALL_WORDPRESS_USERS_KEY)).toBeNull()
    expect(wordpressUserIdOf({ key: 0 })).toBeNull()
    expect(wordpressUserIdOf({ key: 5 })).toBe(5)
    expect(wordpressUserIdOf('9')).toBe(9)
  })

  it('builds the Login as dropdown with All users first', () => {
    const items = buildWordpressUserDropdownItems([
      { id: 3, display_name: 'Jane', user_email: 'jane@example.com' },
      { id: 4, email: 'bob@example.com' },
    ], t)

    expect(items).toEqual([
      { text: 'form.option.sharedAccess.loginAs.allUsers', key: 0, tooltip: 'tooltip.sharedAccess.loginAs.allUsers' },
      { text: 'Jane', key: 3, tooltip: 'Jane - jane@example.com' },
      { text: 'bob@example.com', key: 4, tooltip: 'bob@example.com - bob@example.com' },
    ])
  })
})

describe('assigned users', () => {
  it('maps the shared access of one instance, naming a user by e-mail when there is no name', () => {
    const users = assignedUsersOf({
      sharedAccess: [
        entry('a@example.com', 'developer', { custom_privileges: ['x'], wordpress_user_id: '5' as unknown as number }),
        { email: 'b@example.com', role: 'view_only', accepted_at: null },
      ],
    })

    expect(users[0]).toMatchObject({ name: 'a', email: 'a@example.com', role: 'developer', customPrivileges: ['x'], wordpress_user_id: 5, invitationPending: false })
    expect(users[1]).toMatchObject({ name: 'b@example.com', invitationPending: true, customPrivileges: [], wordpress_user_id: null })
  })

  it('merges the users of a selection and marks differing roles and missing users as mixed', () => {
    const users = assignedUsersOfMany([
      { id: 1, sharedAccess: [entry('a@example.com', 'developer'), entry('b@example.com', 'view_only')] },
      { id: 2, sharedAccess: [entry('a@example.com', 'developer'), entry('c@example.com', 'view_only')] },
      { id: 3, sharedAccess: [entry('a@example.com', 'full_access', { custom_privileges: ['keep?'] })] },
    ])

    const byEmail = Object.fromEntries(users.map(item => [item.email, item]))
    expect(byEmail['a@example.com']).toMatchObject({ role: 'mixed', instancesIds: [1, 2, 3], customPrivileges: [] })
    expect(byEmail['b@example.com']).toMatchObject({ role: 'mixed', instancesIds: [1] })
    expect(byEmail['c@example.com']).toMatchObject({ role: 'mixed', instancesIds: [2] })
  })

  it('keeps the role of a user every selected instance agrees on', () => {
    const users = assignedUsersOfMany([
      { id: 1, sharedAccess: [entry('a@example.com', 'developer')] },
      { id: 2, sharedAccess: [entry('a@example.com', 'developer')] },
    ])

    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ role: 'developer', instancesIds: [1, 2] })
  })

  it('keeps a pending invitation pending when any instance has it pending, and the latest dates', () => {
    const users = assignedUsersOfMany([
      { id: 1, sharedAccess: [entry('a@example.com', 'view_only', { invited_at: '2026-01-01T00:00:00.000Z', resend_available_at: '2026-01-02T00:00:00.000Z' })] },
      { id: 2, sharedAccess: [{ email: 'a@example.com', role: 'view_only', accepted_at: null, invited_at: '2026-02-01T00:00:00.000Z', resend_available_at: '2026-03-01T00:00:00.000Z' }] },
    ])

    expect(users[0]).toMatchObject({ invitationPending: true, invited_at: '2026-02-01T00:00:00.000Z', resend_available_at: '2026-03-01T00:00:00.000Z' })
  })

  it('reads a missing date as now and a null date as invalid, like moment', () => {
    expect(momentFromNow(undefined)).toBe('a few seconds ago')
    expect(momentFromNow(null)).toBe('Invalid date')
  })
})

describe('suggestions and chips', () => {
  const suggestions = [{ email: 'a@example.com', name: 'Ann' }, { email: 'b@example.com', name: 'Bob' }]

  it('hides the suggestions that are already on the list', () => {
    expect(filterSuggestions(suggestions, [{ email: 'a@example.com' }])).toEqual([suggestions[1]])
  })

  it('matches the query against the e-mail and the name, ignoring case', () => {
    expect(suggestionMatches(suggestions[0]!, 'ANN')).toBe(true)
    expect(suggestionMatches(suggestions[0]!, 'b@')).toBe(false)
    expect(suggestionMatches(suggestions[1]!, 'example')).toBe(true)
  })

  it('accepts a suggestion object and a well-formed typed address only', () => {
    expect(isEmailCorrect({ email: 'x', name: 'y' })).toBe(true)
    expect(isEmailCorrect('jane.doe@example.com')).toBe(true)
    expect(isEmailCorrect('jane-doe@mail.example.co')).toBe(true)
    expect(isEmailCorrect('jane@example')).toBe(false)
    expect(isEmailCorrect('jane@example.comm')).toBe(false)
    expect(isEmailCorrect('jane@example.info1')).toBe(false)
    expect(isEmailCorrect('jane')).toBe(false)
    expect(isEmailCorrect('')).toBe(false)
  })

  it('does not backtrack exponentially on a long local part (the legacy pattern does)', () => {
    const started = Date.now()
    expect(isEmailCorrect(`${'a'.repeat(40)}!`)).toBe(false)
    expect(Date.now() - started).toBeLessThan(200)
  })
})

describe('buildInviteRequest', () => {
  it('sends the role and the addresses, taking the e-mail of a suggestion', () => {
    const request = buildInviteRequest({
      role: 'view_only',
      customPrivileges: [],
      users: [{ email: 'a@example.com' }, 'b@example.com'],
      applyToStagings: true,
      wordpressUserId: null,
    })

    expect(request).toEqual({ role: 'view_only', emails: ['a@example.com', 'b@example.com'], apply_to_stagings: true })
  })

  it('adds the custom privileges for the custom role only', () => {
    const custom = buildInviteRequest({ role: 'custom', customPrivileges: ['general.view_logs'], users: ['a@example.com'], applyToStagings: false, wordpressUserId: null })
    const other = buildInviteRequest({ role: 'developer', customPrivileges: ['general.view_logs'], users: ['a@example.com'], applyToStagings: false, wordpressUserId: 4 })

    expect(custom.custom_privileges).toEqual(['general.view_logs'])
    expect(other.custom_privileges).toBeUndefined()
  })

  it('sends wordpress_user_id for one address with an SSO role, null meaning all users', () => {
    const base = { customPrivileges: [], applyToStagings: false }
    expect(buildInviteRequest({ ...base, role: 'developer', users: ['a@example.com'], wordpressUserId: 4 }).wordpress_user_id).toBe(4)
    expect(buildInviteRequest({ ...base, role: 'developer', users: ['a@example.com'], wordpressUserId: null }).wordpress_user_id).toBeNull()
    expect(buildInviteRequest({ ...base, role: 'developer', users: ['a@example.com', 'b@example.com'], wordpressUserId: 4 })).not.toHaveProperty('wordpress_user_id')
    expect(buildInviteRequest({ ...base, role: 'view_only', users: ['a@example.com'], wordpressUserId: 4 })).not.toHaveProperty('wordpress_user_id')
  })
})

describe('buildSingleSaveRequests', () => {
  it('builds the update and remove lists, adding wordpress_user_id for SSO roles', () => {
    const { update, remove } = buildSingleSaveRequests(
      {
        'a@example.com': user('a@example.com', 'developer', { wordpress_user_id: 6 }),
        'b@example.com': user('b@example.com', 'view_only', { wordpress_user_id: 7 }),
      },
      { 'c@example.com': user('c@example.com', 'view_only') },
      true,
    )

    expect(update).toEqual([
      { email: 'a@example.com', role: 'developer', custom_privileges: [], apply_to_stagings: true, wordpress_user_id: 6 },
      { email: 'b@example.com', role: 'view_only', custom_privileges: [], apply_to_stagings: true },
    ])
    expect(remove).toEqual([{ email: 'c@example.com', apply_to_stagings: true }])
  })

  it('returns empty lists when nothing is pending', () => {
    expect(buildSingleSaveRequests({}, {}, false)).toEqual({ update: [], remove: [] })
  })
})

describe('buildMultiSavePlan', () => {
  const instances = [{ id: 1 }, { id: 2 }]

  it('updates a user where they exist and invites them where they do not', () => {
    const plan = buildMultiSavePlan(
      instances,
      { 'a@example.com': user('a@example.com', 'developer', { instancesIds: [1], wordpress_user_id: 3 }) },
      {},
      false,
    )

    expect(plan).toEqual([
      { kind: 'update', instanceId: 1, users: [{ email: 'a@example.com', role: 'developer', custom_privileges: [], apply_to_stagings: false, wordpress_user_id: 3 }] },
      { kind: 'invite', instanceId: 2, request: { emails: ['a@example.com'], role: 'developer', custom_privileges: [], apply_to_stagings: false, wordpress_user_id: 3 } },
    ])
  })

  it('groups the updates of one instance in one request and removes a user only where they exist', () => {
    const plan = buildMultiSavePlan(
      instances,
      {
        'a@example.com': user('a@example.com', 'view_only', { instancesIds: [1, 2] }),
        'b@example.com': user('b@example.com', 'view_only', { instancesIds: [1, 2] }),
      },
      { 'c@example.com': user('c@example.com', 'view_only', { instancesIds: [2] }) },
      true,
    )

    expect(plan.map(operation => [operation.kind, operation.instanceId])).toEqual([
      ['update', 1],
      ['update', 2],
      ['remove', 2],
    ])
    expect(plan[0]).toMatchObject({ users: [{ email: 'a@example.com' }, { email: 'b@example.com' }] })
    expect(plan[2]).toEqual({ kind: 'remove', instanceId: 2, users: [{ email: 'c@example.com', apply_to_stagings: true }] })
  })

  it('is empty when nothing is pending', () => {
    expect(buildMultiSavePlan(instances, {}, {}, false)).toEqual([])
  })
})

describe('hasStagings', () => {
  it('reads the selection when there is one, otherwise the instance', () => {
    expect(hasStagings({ id: 0 }, [])).toBe(false)
    expect(hasStagings({ id: 5, subInstances: [{}] }, [])).toBe(true)
    expect(hasStagings({ id: 5, subInstances: [] }, [])).toBe(false)
    expect(hasStagings({ id: 0 }, [{ id: 1, subInstances: [] }, { id: 2, subInstances: [{}] }])).toBe(true)
    expect(hasStagings({ id: 5, subInstances: [{}] }, [{ id: 1, subInstances: [] }])).toBe(false)
  })
})
