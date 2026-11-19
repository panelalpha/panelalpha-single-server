import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import * as actions from './instance-actions.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const reply = (data: unknown) => ({ data: { data } })

describe('instance-actions.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the updates and sends the update body as is', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply({ wp_version: '6.5', available_updates: ['6.6'] }))
    expect(await actions.getWordpressUpdates(5)).toEqual({ wp_version: '6.5', available_updates: ['6.6'] })
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/updates')

    await actions.updateWordpress(5, { version: '6.6', create_backup: true })
    expect(api.put).toHaveBeenCalledWith('/instances/5/wordpress/update', { version: '6.6', create_backup: true })
  })

  it('reads the service options outside /instances and copies with the payload', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply({ user_configurable_options: { region: [{ text: 'EU', value: 'eu' }] } }))
    expect(await actions.getServiceInstanceOptions(3)).toEqual({ region: [{ text: 'EU', value: 'eu' }] })
    expect(api.get).toHaveBeenCalledWith('/services/3/instance-options')

    await actions.copyInstance(5, { service_id: 3, user_configurable_options: { x: 'y' } })
    expect(api.post).toHaveBeenCalledWith('/instances/5/copy', { service_id: 3, user_configurable_options: { x: 'y' } })
  })

  it('reads and pushes through the staging id', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply({ tables_structure_diff: ['a'], tables_data_diff: [] }))
    expect(await actions.getPushToLiveDiff(9)).toEqual({ tables_structure_diff: ['a'], tables_data_diff: [] })
    expect(api.get).toHaveBeenCalledWith('/instances/9/push-to-live')

    const body = { overwrite_files: false, push_db: false, structural_change_tables: null, datachange_tables: null }
    await actions.pushToLive(9, body)
    expect(api.put).toHaveBeenCalledWith('/instances/9/push-to-live', body)
  })

  it('reads and pushes to staging through the live id', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply({ tables_structure_diff: ['a'], tables_data_diff: [] }))
    expect(await actions.getPushToStagingDiff(9)).toEqual({ tables_structure_diff: ['a'], tables_data_diff: [] })
    expect(api.get).toHaveBeenCalledWith('/instances/9/push-to-staging')

    const body = { overwrite_files: false, push_db: true, structural_change_tables: null, datachange_tables: null }
    await actions.pushToStaging(9, body)
    expect(api.put).toHaveBeenCalledWith('/instances/9/push-to-staging', body)
  })

  it('calls the WordPress SSO endpoints', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply([{ id: 1 }]))
    await actions.getWordpressSsoUsers(5)
    expect(api.get).toHaveBeenCalledWith('/instances/5/wordpress/users?role=administrator&for_sso=1')

    vi.mocked(api.post).mockResolvedValue(reply({ sso_url: 'https://x' }))
    expect(await actions.createSsoUrl(5, 2)).toEqual({ sso_url: 'https://x' })
    expect(api.post).toHaveBeenCalledWith('/instances/5/sso-url', { user: 2 })
    await actions.createSsoPreviewUrl(5, 2)
    expect(api.post).toHaveBeenCalledWith('/instances/5/sso-preview-url', { user: 2 })
  })

  it('calls the app-lite SSO endpoints (sso-url has no body)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply([{ id: 1 }]))
    await actions.getAppSsoUsers(5)
    expect(api.get).toHaveBeenCalledWith('/instances/5/users')

    vi.mocked(api.post).mockResolvedValue(reply({ sso_url: 'https://x' }))
    await actions.createAppSsoUrl(5, 2)
    expect(api.post).toHaveBeenCalledWith('/instances/5/users/2/sso-url')
    await actions.createAppSsoPreviewUrl(5, 2)
    expect(api.post).toHaveBeenCalledWith('/instances/5/users/2/sso-preview-url', { user: 2 })
  })

  it('checks the disk usage and creates the staging', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(reply({ uploads_dir_usage: 10 }))
    expect(await actions.getStagingDiskUsage(5)).toEqual({ uploads_dir_usage: 10 })
    expect(api.get).toHaveBeenCalledWith('/instances/5/staging/pre-check-disk-usage')

    vi.mocked(api.post).mockResolvedValueOnce(reply({ id: 6 }))
    expect(await actions.createStaging(5, { domain: 'staging.a.com', skip_uploads_dir: false })).toEqual({ id: 6 })
    expect(api.post).toHaveBeenCalledWith('/instances/5/staging', { domain: 'staging.a.com', skip_uploads_dir: false })
  })

  it('retries an import and an installation', async () => {
    vi.mocked(api.put).mockResolvedValue(reply({ id: 5 }))
    await actions.quickRetryImport(5)
    expect(api.put).toHaveBeenCalledWith('/instances/5/import/quick-retry')

    await actions.retryInstall(5, { install_method: 'git' })
    expect(api.put).toHaveBeenCalledWith('/instances/5/retry-install', { install_method: 'git' })
  })
})
