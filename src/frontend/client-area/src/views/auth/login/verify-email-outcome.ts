/**
 * Post-verify branches:
 * the route push happens unless `skipDashboard`, the `after-login` signal only when `registering`.
 */
export interface VerifyEmailOutcome {
  navigate: boolean
  afterLogin: boolean
}

export function resolveVerifyEmailOutcome (options: {
  registering: boolean
  skipDashboard: boolean
}): VerifyEmailOutcome {
  return {
    navigate: !options.skipDashboard,
    afterLogin: options.registering,
  }
}
