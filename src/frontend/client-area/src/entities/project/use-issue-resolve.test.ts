import type { IssueResolvePayload } from '@/entities/project/ui/status-issues/status-issues.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { redeployFromArchive, uploadDeployArchive } from './instance-files.api'
import { REDEPLOY_FAILED_KEY, REDEPLOY_IN_PROGRESS_KEY, redeployFailureKey, useIssueResolve } from './use-issue-resolve'

vi.mock('./instance-files.api', () => ({ uploadDeployArchive: vi.fn(), redeployFromArchive: vi.fn() }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => `t:${key}` }) }))

const file = new File(['x'], 'site.zip')

function payload (ui: string): IssueResolvePayload {
  return {
    issue: { code: 'deploy.missing_index', solutions: [{ id: 'sol', ui }] },
    solutionId: 'sol',
    value: file,
  } as unknown as IssueResolvePayload
}

describe('useIssueResolve', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('uploads, redeploys and then marks the issue resolved, in that order', async () => {
    const order: string[] = []
    vi.mocked(uploadDeployArchive).mockImplementation(() => {
      order.push('upload')
      return Promise.resolve('/tmp/site.zip')
    })
    vi.mocked(redeployFromArchive).mockImplementation(() => {
      order.push('redeploy')
      return Promise.resolve()
    })
    const markResolved = vi.fn(() => order.push('resolved'))

    await useIssueResolve().onResolve(5, payload('upload-archive'), { markResolved })

    expect(uploadDeployArchive).toHaveBeenCalledWith(5, file)
    expect(redeployFromArchive).toHaveBeenCalledWith(5, '/tmp/site.zip')
    expect(markResolved).toHaveBeenCalledWith('deploy.missing_index')
    expect(order).toEqual(['upload', 'redeploy', 'resolved'])
  })

  it('does nothing for a solution other than the archive upload or without a file', async () => {
    const markResolved = vi.fn()
    const resolver = useIssueResolve()
    await resolver.onResolve(5, payload('other'), { markResolved })
    await resolver.onResolve(5, { ...payload('upload-archive'), value: null } as unknown as IssueResolvePayload, { markResolved })
    expect(uploadDeployArchive).not.toHaveBeenCalled()
    expect(markResolved).not.toHaveBeenCalled()
    expect(resolver.isSubmitting(5)).toBe(false)
  })

  it('shows the API message on failure and keeps the issue open', async () => {
    vi.mocked(uploadDeployArchive).mockRejectedValue({ response: { status: 500, data: { message: 'Disk full' } } })
    const markResolved = vi.fn()
    await useIssueResolve().onResolve(5, payload('upload-archive'), { markResolved })

    expect(markResolved).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'Disk full' }])
  })

  it('shows the generic message for an error without response data', async () => {
    vi.mocked(uploadDeployArchive).mockRejectedValue(new Error('boom'))
    await useIssueResolve().onResolve(5, payload('upload-archive'), null)
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
  })

  it('shows the message of a 409 from the server when it sends one', async () => {
    vi.mocked(uploadDeployArchive).mockResolvedValue('/tmp/site.zip')
    vi.mocked(redeployFromArchive).mockRejectedValue({ response: { status: 409, data: { message: 'A deploy is already running.' } } })
    await useIssueResolve().onResolve(5, payload('upload-archive'), null)
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'A deploy is already running.' }])
  })

  it('maps the failure to its own copy key: 409 is "in progress", the rest "failed"', () => {
    expect(REDEPLOY_IN_PROGRESS_KEY).toBe('notification.instance.files.redeploy.inProgress')
    expect(REDEPLOY_FAILED_KEY).toBe('notification.instance.files.redeploy.failed')
    expect(redeployFailureKey({ response: { status: 409 } })).toBe(REDEPLOY_IN_PROGRESS_KEY)
    expect(redeployFailureKey({ response: { status: 500 } })).toBe(REDEPLOY_FAILED_KEY)
    expect(redeployFailureKey(new Error('offline'))).toBe(REDEPLOY_FAILED_KEY)
    expect(redeployFailureKey(null)).toBe(REDEPLOY_FAILED_KEY)
  })

  it('refuses a second resolve of the same instance while one runs, per instance', async () => {
    let finish: (path: string) => void = () => undefined
    vi.mocked(uploadDeployArchive).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }))
    vi.mocked(redeployFromArchive).mockResolvedValue()
    const resolver = useIssueResolve()

    const first = resolver.onResolve(5, payload('upload-archive'), null)
    expect(resolver.isSubmitting(5)).toBe(true)
    expect(resolver.isSubmitting(6)).toBe(false)
    await resolver.onResolve(5, payload('upload-archive'), null)
    expect(uploadDeployArchive).toHaveBeenCalledTimes(1)

    finish('/tmp/a')
    await first
    expect(resolver.isSubmitting(5)).toBe(false)
  })

  it('translates the key a widget relays as an error alert', () => {
    useIssueResolve().onError('heading.instance.statusIndicator.dropZone.tooLarge')
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 't:heading.instance.statusIndicator.dropZone.tooLarge' }])
  })
})
