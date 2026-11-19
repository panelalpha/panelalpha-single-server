import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { createInstancePrivilegeMethods } from '@/entities/privileges/instance-privilege-methods'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import { availableLogTabs, canViewDeployLogs, initialLoads } from './logs-tabs'

// The privilege methods are the real ones, read through `this.privileges` as on the resource.
function instance (type: string | null, privileges: string[], isContainer = true): InstanceResource {
  return {
    type,
    isContainer,
    ...createInstancePrivilegeMethods(type),
    privileges,
  } as unknown as InstanceResource
}

describe('availableLogTabs', () => {
  it('returns every tab in legacy order when all privileges are granted', () => {
    const tabs = availableLogTabs(instance('custom', [
      P.VIEW_LOGS,
      P.WORDPRESS_VIEW_LOGS,
      P.VIEW_PHP_LOGS,
      P.VIEW_WEBSERVER_LOGS,
    ]))

    expect(tabs).toEqual(['instance', 'deploy', 'wordpress', 'php', 'webserver'])
  })

  it('returns no tabs without any log privilege', () => {
    expect(availableLogTabs(instance('wordpress', []))).toEqual([])
  })

  it('omits deploy for a wordpress instance even with view_logs', () => {
    const tabs = availableLogTabs(instance('wordpress', [P.VIEW_LOGS]))

    expect(tabs).toEqual(['instance'])
  })

  it('omits deploy when the type is missing and treats it as wordpress', () => {
    expect(availableLogTabs(instance(null, [P.VIEW_LOGS]))).toEqual(['instance'])
  })

  it('shows deploy for a custom instance only with view_logs', () => {
    expect(availableLogTabs(instance('custom', [P.WORDPRESS_VIEW_LOGS]))).toEqual(['wordpress'])
    expect(availableLogTabs(instance('custom', [P.VIEW_LOGS]))).toEqual(['instance', 'deploy'])
  })

  it('has no deploy tab for a classic PHP hosting project', () => {
    // A PHP hosting project is `custom` too, but the panel has no deploy log for it (the API answers 422).
    expect(availableLogTabs(instance('custom', [P.VIEW_LOGS, P.VIEW_PHP_LOGS], false))).toEqual(['instance', 'php'])
  })

  it('shows php and webserver on their own privileges, without instance logs', () => {
    expect(availableLogTabs(instance('wordpress', [P.VIEW_PHP_LOGS]))).toEqual(['php'])
    expect(availableLogTabs(instance('wordpress', [P.VIEW_WEBSERVER_LOGS]))).toEqual(['webserver'])
  })
})

describe('canViewDeployLogs', () => {
  it('needs both a custom type and view_logs', () => {
    expect(canViewDeployLogs(instance('custom', [P.VIEW_LOGS]))).toBe(true)
    expect(canViewDeployLogs(instance('custom', []))).toBe(false)
    expect(canViewDeployLogs(instance('wordpress', [P.VIEW_LOGS]))).toBe(false)
  })

  it('is false for a classic PHP hosting project, which has no deploy log', () => {
    expect(canViewDeployLogs(instance('custom', [P.VIEW_LOGS], false))).toBe(false)
  })
})

describe('initialLoads', () => {
  it('treats instance as first and loads only the webserver list in the background', () => {
    expect(initialLoads(['instance', 'wordpress', 'webserver'])).toEqual({
      first: 'instance',
      background: ['webserver'],
    })
    expect(initialLoads(['instance', 'wordpress', 'php', 'webserver'])).toEqual({
      first: 'instance',
      background: ['webserver'],
    })
  })

  it('loads wordpress first and keeps the webserver list in the background', () => {
    expect(initialLoads(['wordpress', 'php', 'webserver'])).toEqual({
      first: 'wordpress',
      background: ['webserver'],
    })
  })

  it('loads php first and keeps the webserver list in the background', () => {
    expect(initialLoads(['php', 'webserver'])).toEqual({ first: 'php', background: ['webserver'] })
  })

  it('leaves webserver out of the background when it is first, because it is awaited', () => {
    expect(initialLoads(['webserver'])).toEqual({ first: 'webserver', background: [] })
    expect(initialLoads(['webserver', 'php'])).toEqual({ first: 'webserver', background: [] })
  })

  it('loads deploy in the background after instance, and first when instance is missing', () => {
    expect(initialLoads(['instance', 'deploy', 'wordpress'])).toEqual({
      first: 'instance',
      background: ['deploy'],
    })
    expect(initialLoads(['deploy', 'wordpress', 'webserver'])).toEqual({
      first: 'deploy',
      background: ['webserver'],
    })
  })

  it('has nothing to load without tabs', () => {
    expect(initialLoads([])).toEqual({ first: null, background: [] })
  })

  it('does not load the deploy list of a classic PHP hosting project on open', () => {
    const tabs = availableLogTabs(instance('custom', [P.VIEW_LOGS, P.VIEW_PHP_LOGS], false))

    expect(initialLoads(tabs)).toEqual({ first: 'instance', background: [] })
  })
})
