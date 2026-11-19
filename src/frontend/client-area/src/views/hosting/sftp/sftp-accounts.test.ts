import type { HostingService } from '@/views/hosting/hosting.types'
import type { SftpAccount } from './sftp.api'
import { describe, expect, it, vi } from 'vitest'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { sftpHeaders, sftpMenuActions, toSftpRow } from './sftp-accounts'

// The translator echoes the key, so the expected strings show exactly which key was used.
const t = (key: string) => key

function account (overrides: Partial<SftpAccount> = {}): SftpAccount {
  return {
    user: 'example_deploy',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('toSftpRow', () => {
  it('takes updated_at_text from fromNow and keeps the raw updated_at for search and sort', () => {
    const fromNow = vi.fn(() => '2 days ago')
    const row = toSftpRow(account(), ['edit_password'], fromNow)

    expect(fromNow).toHaveBeenCalledWith('2026-09-20T10:00:00.000Z')
    expect(row.updated_at_text).toBe('2 days ago')
    expect(row.updated_at).toBe('2026-09-20T10:00:00.000Z')
  })

  it('shows a dash and skips fromNow when updated_at is null', () => {
    const fromNow = vi.fn(() => 'never')
    const row = toSftpRow(account({ updated_at: null }), ['edit_password'], fromNow)

    expect(row.updated_at_text).toBe('-')
    expect(fromNow).not.toHaveBeenCalled()
  })

  it('gives every row the actions of the response meta and infoButtonLoading false', () => {
    const row = toSftpRow(account(), ['edit_password'], () => 'x')

    expect(row).toEqual({
      ...account(),
      updated_at_text: 'x',
      infoButtonLoading: false,
      actions: ['edit_password'],
    })
  })

  it('keeps an empty actions list, so the row has no edit button', () => {
    expect(toSftpRow(account(), [], () => 'x').actions).toEqual([])
  })
})

describe('sftpHeaders', () => {
  it('has the three legacy columns, without directory or usage', () => {
    expect(sftpHeaders.map(header => header.text)).toEqual(['user', 'updated', 'actions'])
    expect(sftpHeaders.map(header => header.value)).toEqual(['user', 'updated_at', 'actions'])
  })
})

describe('sftpMenuActions', () => {
  it('offers only Disconnect all when the plan does not allow the user to enable SSH', () => {
    const service: HostingService = makeService({ plan_settings: { allow_user_enable_ssh_access: false } })

    expect(sftpMenuActions(t, service).map(action => action.id)).toEqual(['disconnect'])
  })

  it('adds Manage SSH access as the second item when the plan allows the user to enable SSH', () => {
    const service: HostingService = makeService({ plan_settings: { allow_user_enable_ssh_access: true } })
    const actions = sftpMenuActions(t, service)

    expect(actions).toEqual([
      { id: 'disconnect', title: 'button.disconnect.all', icon: '$logout', iconSize: '20' },
      { id: 'access', title: 'button.manageSshAccess', icon: '$settings', iconSize: '20' },
    ])
  })

  it('offers only Disconnect all in a project, even when the plan allows the user to enable SSH', () => {
    const service: HostingService = makeService({ plan_settings: { allow_user_enable_ssh_access: true } })

    expect(sftpMenuActions(t, service, 'project').map(action => action.id)).toEqual(['disconnect'])
  })
})
