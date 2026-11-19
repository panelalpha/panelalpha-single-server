import { describe, expect, it } from 'vitest'
import { resolveVerifyEmailOutcome } from './verify-email-outcome'

describe('resolveVerifyEmailOutcome', () => {
  it('registering without skipDashboard navigates and signals after-login', () => {
    expect(resolveVerifyEmailOutcome({ registering: true, skipDashboard: false }))
      .toEqual({ navigate: true, afterLogin: true })
  })

  it('login verify (registering false) navigates without the after-login signal', () => {
    expect(resolveVerifyEmailOutcome({ registering: false, skipDashboard: false }))
      .toEqual({ navigate: true, afterLogin: false })
  })

  it('skipDashboard suppresses navigation but keeps the registering signal', () => {
    expect(resolveVerifyEmailOutcome({ registering: true, skipDashboard: true }))
      .toEqual({ navigate: false, afterLogin: true })
    expect(resolveVerifyEmailOutcome({ registering: false, skipDashboard: true }))
      .toEqual({ navigate: false, afterLogin: false })
  })
})
