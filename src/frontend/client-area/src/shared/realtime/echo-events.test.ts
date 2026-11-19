import { describe, expect, it, vi } from 'vitest'
import {
  dispatchDeployLogUpdated,
  dispatchDiagnosticModeEnabled,
  dispatchImportStatusChanged,
  dispatchNotification,
  dispatchSslCertificateInstalled,
  NOTIFICATION_RULES,
} from './echo-events'

const entity = { id: 7 }
const body = { instance: entity, backup: { b: 1 }, plugin: { p: 1 }, theme: { t: 1 } }

function run (type: string) {
  const emit = vi.fn()
  const result = dispatchNotification({ type, ...body }, emit)
  return { emit, result }
}

describe('dispatchNotification', () => {
  it.each([
    ['user.instance.installation_finished', [['instance-installation-finished', entity], ['instance-item-changed', entity]]],
    ['user.instance.installation_failed', [['instance-installation-failed', entity], ['instance-item-changed', entity]]],
    ['user.instance.redeploy_finished', [['instance-redeploy-finished', entity], ['instance-item-changed', entity]]],
    ['user.instance.redeploy_failed', [['instance-redeploy-failed', entity], ['instance-item-changed', entity]]],
    ['user.instance.create_staging_finished', [['staging-install-finished', entity]]],
    ['user.instance.create_staging_failed', [['staging-install-failed', entity]]],
    ['user.instance.push_to_live_finished', [['push-to-live-finished', entity]]],
    ['user.instance.push_to_live_failed', [['push-to-live-failed', entity]]],
    ['user.instance.update_wordpress_finished', [['instance-update-finished', entity]]],
    ['user.instance.update_wordpress_failed', [['instance-update-failed', entity]]],
    ['user.instance.backup.create_finished', [['backup-item-changed', body.backup]]],
    ['user.instance.backup.create_failed', [['backup-item-changed', body.backup]]],
    ['user.instance.backup.restore_finished', [['backup-item-changed', body.backup]]],
    ['user.instance.backup.restore_failed', [['backup-item-changed', body.backup]]],
    ['user.instance.backup.delete_failed', [['backup-item-changed', body.backup]]],
    ['user.instance.backup.delete_finished', [['backup-item-deleted', body.backup]]],
    ['user.instance.plugin.install_finished', [['plugin-item-changed', body.plugin]]],
    ['user.instance.plugin.install_failed', [['plugin-install-failed', body.plugin], ['plugin-item-changed', body.plugin]]],
    ['user.instance.plugin.update_finished', [['plugin-item-changed', body.plugin]]],
    ['user.instance.plugin.update_failed', [['plugin-item-changed', body.plugin]]],
    ['user.instance.theme.install_finished', [['theme-item-changed', body.theme]]],
    ['user.instance.theme.install_failed', [['theme-item-changed', body.theme]]],
    ['user.instance.theme.update_finished', [['theme-item-changed', body.theme]]],
    ['user.instance.theme.update_failed', [['theme-item-changed', body.theme]]],
    ['user.instance.push_to_staging_finished', [['push-to-staging-finished', entity]]],
    ['user.instance.push_to_staging_failed', [['push-to-staging-failed', entity]]],
    ['user.instance.wordpress_mcp.enable_finished', [['wordpress-mcp-status-changed', entity]]],
    ['user.instance.wordpress_mcp.enable_failed', [['wordpress-mcp-status-changed', entity]]],
    ['user.instance.wordpress_mcp.disable_finished', [['wordpress-mcp-status-changed', entity]]],
    ['user.instance.wordpress_mcp.disable_failed', [['wordpress-mcp-status-changed', entity]]],
    ['user.service.sync_hosting_account.failed', [['service-sync-hosting-account-failed']]],
    ['user.service.sync_hosting_account.finished', [['service-sync-hosting-account-finished']]],
  ] as Array<[string, unknown[][]]>)('%s emits the legacy events with the legacy payloads', (type, calls) => {
    const { emit } = run(type)
    expect(emit.mock.calls).toEqual(calls)
  })

  it('covers every rule in the table', () => {
    expect(Object.keys(NOTIFICATION_RULES)).toHaveLength(32)
  })

  it('asks for a /home refresh only on installation_finished', () => {
    for (const type of Object.keys(NOTIFICATION_RULES)) {
      expect(run(type).result.refreshHome).toBe(type === 'user.instance.installation_finished')
    }
  })

  it('ignores unknown types, including inherited object keys', () => {
    for (const type of ['user.unknown', 'constructor', 'toString']) {
      const { emit, result } = run(type)
      expect(emit).not.toHaveBeenCalled()
      expect(result.refreshHome).toBe(false)
    }
  })
})

describe('listen channels', () => {
  it('DiagnosticModeEnabled emits one event per application', () => {
    const emit = vi.fn()
    dispatchDiagnosticModeEnabled({ applications: [{ id: 1 }, { id: 2 }] }, emit)
    expect(emit.mock.calls).toEqual([['diagnostic-mode-enabled', { id: 1 }], ['diagnostic-mode-enabled', { id: 2 }]])
  })

  it('SslCertificateInstalled and ImportStatusChanged emit only with an application', () => {
    const emit = vi.fn()
    dispatchSslCertificateInstalled({}, emit)
    dispatchImportStatusChanged({}, emit)
    expect(emit).not.toHaveBeenCalled()

    dispatchSslCertificateInstalled({ application: { id: 3 } }, emit)
    dispatchImportStatusChanged({ application: { id: 4 } }, emit)
    expect(emit.mock.calls).toEqual([['ssl-certificate-installed', { id: 3 }], ['import-status-changed', { id: 4 }]])
  })

  it('DeployLogUpdated emits the whole body', () => {
    const emit = vi.fn()
    dispatchDeployLogUpdated({ log: 'x' }, emit)
    expect(emit).toHaveBeenCalledWith('deploy-log-updated', { log: 'x' })
  })
})
