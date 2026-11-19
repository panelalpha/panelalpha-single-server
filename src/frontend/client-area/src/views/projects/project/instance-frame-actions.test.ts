import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import {
  adminSsoButton,
  canShowAdminArea,
  canShowCopy,
  canShowPushToLive,
  deleteFollowUp,
  hasWordPressUpdate,
  isWordpressProject,
  pushStatusPatches,
  pushToStagingStatusPatches,
  updateStatusPatches,
} from './instance-frame-actions'

describe('hasWordPressUpdate', () => {
  it('is true only when the available version is greater than the installed one', () => {
    expect(hasWordPressUpdate({ wordpress: '6.4', wordpress_available: '6.5' })).toBe(true)
    expect(hasWordPressUpdate({ wordpress: '6.5', wordpress_available: '6.5' })).toBe(false)
  })

  it('compares the versions as numbers across a digit-count boundary', () => {
    expect(hasWordPressUpdate({ wordpress: '9.9.0', wordpress_available: '10.0.0' })).toBe(true)
    expect(hasWordPressUpdate({ wordpress: '9.0.0', wordpress_available: '11.3.0' })).toBe(true)
    expect(hasWordPressUpdate({ wordpress: '11.3.0', wordpress_available: '9.0.0' })).toBe(false)
  })

  it('is false without status', () => {
    expect(hasWordPressUpdate(undefined)).toBe(false)
    expect(hasWordPressUpdate(null)).toBe(false)
  })
})

describe('canShowCopy', () => {
  const allowed = { copy_instance_allowed: true }

  it('needs a wide screen, the plan flag and the privilege', () => {
    expect(canShowCopy({ lgAndDown: false, planSettings: allowed, hasPrivilege: true })).toBe(true)
  })

  it('is hidden on a narrow screen', () => {
    expect(canShowCopy({ lgAndDown: true, planSettings: allowed, hasPrivilege: true })).toBe(false)
  })

  it('is hidden when the plan does not allow copies or the privilege is missing', () => {
    expect(canShowCopy({ lgAndDown: false, planSettings: { copy_instance_allowed: false }, hasPrivilege: true })).toBe(false)
    expect(canShowCopy({ lgAndDown: false, planSettings: null, hasPrivilege: true })).toBe(false)
    expect(canShowCopy({ lgAndDown: false, planSettings: allowed, hasPrivilege: false })).toBe(false)
  })
})

describe('isWordpressProject', () => {
  it('treats a missing type as WordPress and only custom as not', () => {
    expect(isWordpressProject(undefined)).toBe(true)
    expect(isWordpressProject('wordpress')).toBe(true)
    expect(isWordpressProject('custom')).toBe(false)
  })
})

describe('adminSsoButton', () => {
  it('a WordPress project says WP Admin with the WordPress icon, a custom app keeps Admin Area', () => {
    expect(adminSsoButton(true)).toEqual({ labelKey: 'button.wpAdmin', icon: '$wordpress' })
    expect(adminSsoButton(false)).toEqual({ labelKey: 'button.adminArea', icon: '$settings3' })
  })
})

describe('canShowAdminArea', () => {
  const base = { supportsAdminSso: true, isWordpress: true, hasCreateSsoLinkPrivilege: true, hasManageUsersPrivilege: false }

  it('needs supports_admin_sso', () => {
    expect(canShowAdminArea(base)).toBe(true)
    expect(canShowAdminArea({ ...base, supportsAdminSso: false })).toBe(false)
    expect(canShowAdminArea({ ...base, supportsAdminSso: undefined })).toBe(false)
  })

  it('a WordPress project needs the SSO-link privilege', () => {
    expect(canShowAdminArea({ ...base, hasCreateSsoLinkPrivilege: false, hasManageUsersPrivilege: true })).toBe(false)
  })

  it('a custom project needs the users privilege', () => {
    expect(canShowAdminArea({ ...base, isWordpress: false })).toBe(false)
    expect(canShowAdminArea({ ...base, isWordpress: false, hasManageUsersPrivilege: true })).toBe(true)
  })
})

describe('canShowPushToLive', () => {
  it('is offered on a staging copy only', () => {
    expect(canShowPushToLive('staging', true)).toBe(true)
    expect(canShowPushToLive('live', true)).toBe(false)
    expect(canShowPushToLive('staging', false)).toBe(false)
  })
})

describe('deleteFollowUp (staging and live rule)', () => {
  it('a staging copy goes back to its live parent', () => {
    const parent = { id: 1 } as InstanceResource
    expect(deleteFollowUp({ staging: true, parentInstance: parent })).toEqual({ kind: 'to-parent', parent })
  })

  it('a live instance goes to the root', () => {
    expect(deleteFollowUp({ staging: false, parentInstance: null })).toEqual({ kind: 'to-root' })
  })

  it('a staging copy without its parent goes to the root', () => {
    expect(deleteFollowUp({ staging: true, parentInstance: null })).toEqual({ kind: 'to-root' })
  })
})

describe('status patches', () => {
  it('an update marks the instance itself', () => {
    expect(updateStatusPatches(7)).toEqual([{ id: 7, key: 'update', value: 'in_progress' }])
  })

  it('a push marks the staging copy and its live parent', () => {
    expect(pushStatusPatches({ id: 9, parentInstance: { id: 1 } })).toEqual([
      { id: 9, key: 'push_to_live', value: 'in_progress' },
      { id: 1, key: 'pull_from_staging', value: 'in_progress' },
    ])
  })

  it('a push without a loaded parent marks only the staging copy', () => {
    expect(pushStatusPatches({ id: 9, parentInstance: null })).toEqual([
      { id: 9, key: 'push_to_live', value: 'in_progress' },
    ])
  })

  it('a push to staging marks the live project', () => {
    expect(pushToStagingStatusPatches({ id: 7 })).toEqual([{ id: 7, key: 'push_to_staging', value: 'in_progress' }])
  })
})
