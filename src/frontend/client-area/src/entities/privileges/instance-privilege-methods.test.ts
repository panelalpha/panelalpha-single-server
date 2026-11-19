import { describe, expect, it } from 'vitest'
import { createInstancePrivilegeMethods } from './instance-privilege-methods'
import { checkPrivilege, PRIVILEGES } from './privileges'

describe('checkPrivilege', () => {
  it('treats a missing list as no privileges', () => {
    expect(checkPrivilege(undefined, PRIVILEGES.MANAGE_LABELS)).toBe(false)
    expect(checkPrivilege(null, PRIVILEGES.MANAGE_LABELS)).toBe(false)
    expect(checkPrivilege([PRIVILEGES.MANAGE_LABELS], PRIVILEGES.MANAGE_LABELS)).toBe(true)
  })
})

describe('createInstancePrivilegeMethods', () => {
  const resource = (type: string, privileges: string[], extra: Record<string, unknown> = {}) => ({
    type,
    privileges,
    ...extra,
    ...createInstancePrivilegeMethods(type),
  })

  it('reads this.privileges for every simple method', () => {
    const instance = resource('wordpress', ['general.manage_labels', 'wordpress.update'])
    expect(instance.hasManageLabelsPrivilege()).toBe(true)
    expect(instance.hasWordPressUpdatePrivilege()).toBe(true)
    expect(instance.hasDeleteInstancePrivilege()).toBe(false)
    expect(instance.hasPrivilege('wordpress.update')).toBe(true)
  })

  it('detects any hosting privilege by prefix', () => {
    expect(resource('wordpress', ['hosting.manage_dns']).hasAnyHostingPrivilege()).toBe(true)
    expect(resource('wordpress', ['general.manage_labels']).hasAnyHostingPrivilege()).toBe(false)
  })

  it('gates installation details on the wordpress type', () => {
    expect(resource('wordpress', ['wordpress.view_installation_details']).hasViewInstallationDetailsPrivilege()).toBe(true)
    expect(resource('custom', ['wordpress.view_installation_details']).hasViewInstallationDetailsPrivilege()).toBe(false)
    expect(resource('custom', []).hasInstallationDetails()).toBe(false)
  })

  it('keeps the app and lite user privileges apart', () => {
    const instance = resource('wordpress', ['general.manage_users'])
    expect(instance.hasManageUsersPrivilege()).toBe(false)
    expect(instance.hasManageGeneralUsersPrivilege()).toBe(true)
    expect(resource('wordpress', ['wordpress.manage_users']).hasManageWordpressUsersPrivilege()).toBe(true)
  })

  it('detects the git and files source of a custom project', () => {
    expect(resource('custom', [], { source: { type: 'git' } }).hasGitSource()).toBe(true)
    expect(resource('custom', [], { source: { type: 'files' } }).hasFilesSource()).toBe(true)
    expect(resource('wordpress', [], { source: { type: 'git' } }).hasGitSource()).toBe(false)
  })
})
