import { describe, expect, it, vi } from 'vitest'
import { acceptInviteIfPresent, inviteTokenFromQuery } from './accept-invite'

describe('inviteTokenFromQuery', () => {
  it('returns a non-empty string token', () => {
    expect(inviteTokenFromQuery('abc')).toBe('abc')
  })

  it('ignores arrays, empty string, and absent values', () => {
    expect(inviteTokenFromQuery(['abc'])).toBeNull()
    expect(inviteTokenFromQuery('')).toBeNull()
    expect(inviteTokenFromQuery(undefined)).toBeNull()
    expect(inviteTokenFromQuery(null)).toBeNull()
  })
})

describe('acceptInviteIfPresent', () => {
  it('is a no-op without a string token', async () => {
    const accept = vi.fn()
    await expect(acceptInviteIfPresent(undefined, accept)).resolves.toBe(false)
    await expect(acceptInviteIfPresent(['tok'], accept)).resolves.toBe(false)
    expect(accept).not.toHaveBeenCalled()
  })

  it('calls accept with the token on success', async () => {
    const accept = vi.fn().mockResolvedValue(undefined)
    await expect(acceptInviteIfPresent('tok-1', accept)).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith('tok-1')
  })

  it('swallows accept failures and still reports attempted', async () => {
    const accept = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(acceptInviteIfPresent('tok-1', accept)).resolves.toBe(true)
    expect(accept).toHaveBeenCalledWith('tok-1')
  })
})
