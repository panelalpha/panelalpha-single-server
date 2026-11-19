import type { ShareUser } from './share-instance'
import { describe, expect, it } from 'vitest'
import { shareTableHeaders, shareTableRows } from './share-access-table'

function user (email: string, role = 'developer'): ShareUser {
  return {
    name: email.split('@', 1)[0]!,
    email,
    role,
    customPrivileges: [],
    wordpress_user_id: null,
    invitationPending: false,
    invited_at_text: '',
    notification_sent_at_text: '',
    resend_available_at: null,
  }
}

const t = (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key

describe('shareTableRows', () => {
  it('puts the owner first and then the users, keyed by kind and address', () => {
    const users = [user('ann@example.com'), user('bob@example.com')]
    const rows = shareTableRows({ name: 'Jane', email: 'jane@example.com' }, users)

    expect(rows.map(row => row.key)).toEqual(['owner:jane@example.com', 'user:ann@example.com', 'user:bob@example.com'])
    expect(rows[0]).toMatchObject({ owner: true, name: 'Jane' })
    expect(rows[0]!.user).toBeUndefined()
    expect(rows[1]!.user).toBe(users[0])
  })

  it('has no owner row without an owner address (a selection of several projects)', () => {
    expect(shareTableRows(undefined, [user('ann@example.com')]).map(row => row.owner)).toEqual([false])
    expect(shareTableRows({ name: 'Jane' }, []).length).toBe(0)
  })

  it('drops the users marked for removal, so the counter matches the rows', () => {
    const rows = shareTableRows(null, [user('ann@example.com'), user('bob@example.com')], { 'ann@example.com': user('ann@example.com') })
    expect(rows.map(row => row.email)).toEqual(['bob@example.com'])
  })

  it('names the owner by the address when the name is missing', () => {
    expect(shareTableRows({ email: 'jane@example.com' }, [])[0]!.name).toBe('jane@example.com')
  })
})

describe('shareTableHeaders', () => {
  it('counts the rows in the person header and adds the Log in as column only with an SSO role', () => {
    const plain = shareTableHeaders(t, 3, false)
    expect(plain.map(header => header.value)).toEqual(['person', 'role', 'actions'])
    expect(plain[0]!.label).toBe('general.person:{"count":3}')
    expect(plain.every(header => header.sortable === false)).toBe(true)

    expect(shareTableHeaders(t, 1, true).map(header => header.value)).toEqual(['person', 'role', 'loginAs', 'actions'])
  })
})
