import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { frameNotFoundPushes, resolveFrameRedirect } from './instance-frame'

type FrameInput = Pick<InstanceResource, 'isActive' | 'service_status' | 'diagnostic_mode'>

function active (overrides: Partial<FrameInput> = {}): FrameInput {
  return { isActive: true, service_status: 'active', diagnostic_mode: null, ...overrides }
}

describe('resolveFrameRedirect', () => {
  it('renders the page when the instance is active, the service runs and diagnostic mode is off', () => {
    expect(resolveFrameRedirect(active(), '/instances')).toBeNull()
  })

  it('leaves an inactive instance for the list without an alert', () => {
    expect(resolveFrameRedirect(active({ isActive: false }), '/instances')).toEqual({ path: '/instances' })
  })

  it('leaves a suspended service for the list with the suspended alert', () => {
    expect(resolveFrameRedirect(active({ service_status: 'suspended' }), '/instances')).toEqual({
      path: '/instances',
      alertKey: 'message.serviceSuspended',
    })
  })

  it('leaves a cancelled service for the list with the suspended alert', () => {
    expect(resolveFrameRedirect(active({ service_status: 'cancelled' }), '/projects')).toEqual({
      path: '/projects',
      alertKey: 'message.serviceSuspended',
    })
  })

  it('leaves an instance in diagnostic mode for the list with the diagnostic alert', () => {
    expect(resolveFrameRedirect(active({ diagnostic_mode: true }), '/instances')).toEqual({
      path: '/instances',
      alertKey: 'message.instanceInDiagnosticMode',
    })
  })

  it('checks inactive before suspended and suspended before diagnostic, as legacy does', () => {
    expect(resolveFrameRedirect(
      active({ isActive: false, service_status: 'suspended', diagnostic_mode: true }),
      '/instances',
    )).toEqual({ path: '/instances' })
    expect(resolveFrameRedirect(
      active({ service_status: 'cancelled', diagnostic_mode: true }),
      '/instances',
    )).toEqual({ path: '/instances', alertKey: 'message.serviceSuspended' })
  })

  it('uses the preferred base under single server (lite)', () => {
    expect(resolveFrameRedirect(active({ isActive: false }), '/projects')).toEqual({ path: '/projects' })
  })
})

describe('frameNotFoundPushes', () => {
  it('pushes the 404 page first and the list last, so the list replaces it (lite)', () => {
    expect(frameNotFoundPushes('/projects')).toEqual(['/page-not-found', '/projects'])
  })

  it('ends on /instances outside single server', () => {
    expect(frameNotFoundPushes('/instances')).toEqual(['/page-not-found', '/instances'])
  })
})
