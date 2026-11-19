import { describe, expect, it, vi } from 'vitest'
import { buildMassDeleteModal } from '@/entities/project/action-modal'
import {
  buildClearCacheModal,
  buildCopyModal,
  buildPushBody,
  buildPushLoadingModal,
  buildPushModal,
  buildSingleDeleteModal,
  buildUserConfigurableFields,
  type CancelInstallDeps,
  type CopyService,
  deleteButtonText,
  loadPushModal,
  loadPushStagingModal,
  prefetchUpdates,
  type PushToStagingDeps,
  type RowActionDeps,
  runCancelInstallation,
  runClearCache,
  runCopy,
  runPushToLive,
  runPushToStaging,
  runSingleDelete,
  runUpdate,
  submitCopy,
} from './instance-row-actions'

describe('buildUserConfigurableFields', () => {
  const options = [{ name: 'region', type: 'select' }]
  const optionValues = { region: [{ text: 'EU', value: 'eu' }, { text: 'US', value: 'us' }] }
  const t = (key: string) => key

  it('takes the first value of each option when there is no preset', () => {
    const built = buildUserConfigurableFields(options, optionValues, t)

    expect(built.fields).toEqual([{ label: 'form.label.region', name: 'region', type: 'select', options: [{ label: 'EU', value: 'eu' }, { label: 'US', value: 'us' }] }])
    expect(built.values).toEqual({ region: 'eu' })
  })

  it('lets a preset value win over the first value', () => {
    expect(buildUserConfigurableFields(options, optionValues, t, { region: 'us' }).values).toEqual({ region: 'us' })
  })
})

// Raw keys as copy: `t(key, options)` becomes `key|{"count":1}` when options are given.
const t = (key: string, options?: Record<string, unknown>) => options === undefined ? key : `${key}|${JSON.stringify(options)}`

const wp = { id: 1, hostingServerType: 'cpanel' }
const cloud = { id: 3, hostingServerType: 'wp-cloud' }

function makeDeps (overrides: Partial<RowActionDeps> = {}): RowActionDeps {
  return {
    getWordpressUpdates: vi.fn().mockResolvedValue({ wp_version: '6.4.0', available_updates: ['6.5.0', '6.4.2'] }),
    updateWordpress: vi.fn().mockResolvedValue(undefined),
    getServiceInstanceOptions: vi.fn().mockResolvedValue({ region: [{ text: 'EU', value: 'eu' }, { text: 'US', value: 'us' }] }),
    copyInstance: vi.fn().mockResolvedValue(undefined),
    getPushToLiveDiff: vi.fn().mockResolvedValue({ tables_structure_diff: ['wp_a', 'wp_b'], tables_data_diff: ['wp_posts'] }),
    pushToLive: vi.fn().mockResolvedValue(undefined),
    clearInstanceCache: vi.fn().mockResolvedValue(undefined),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
    refreshHome: vi.fn().mockResolvedValue(undefined),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) => `msg:${(error as Error).message}`),
    t,
    ...overrides,
  }
}

describe('buildClearCacheModal', () => {
  it('is the single clear cache dialog: count 1, no icon, primary action and cancel', () => {
    const modal = buildClearCacheModal(wp, t)

    expect(modal.type).toBe('clear-cache')
    expect(modal.props.title).toBe('heading.instance.clearCache.title')
    expect(modal.props.message).toBe('heading.instance.clearCache.message|{"count":1}')
    expect(modal.props.icon).toBe('')
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.fields).toEqual([])
    expect(modal.width).toBe('560px')
    expect(modal.props.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['submit', 'button.clearCache', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })
})

describe('runClearCache', () => {
  it('clears the one instance and alerts once', async () => {
    const deps = makeDeps()

    await expect(runClearCache(wp, deps)).resolves.toBe('success')

    expect(deps.clearInstanceCache).toHaveBeenCalledExactlyOnceWith(1)
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.clearCache.success')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('shows the error and no success alert when the request fails', async () => {
    const deps = makeDeps({ clearInstanceCache: vi.fn().mockRejectedValue(new Error('boom')) })

    await expect(runClearCache(wp, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:boom')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('buildSingleDeleteModal', () => {
  it('is the mass delete dialog worded for one instance', () => {
    const modal = buildSingleDeleteModal(wp, t)

    expect(modal).toEqual(buildMassDeleteModal([wp], t))
    expect(modal.type).toBe('mass-delete')
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('error')
    expect(modal.props.title).toBe('heading.instance.delete.title|{"count":1}')
    expect(modal.props.message).toBe('heading.instance.delete.message|{"count":1}')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.deleteInstance|{"count":1}', color: 'error' })
    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['remove_data', 'remove_database', 'confirm'])
  })

  it('names the project in the target box, escaped', () => {
    const modal = buildSingleDeleteModal({ ...wp, title: '<b>my site</b>' }, t)

    expect(modal.props.targetBox).toContain('&lt;b&gt;my site&lt;/b&gt;')
    expect(modal.props.targetBox).not.toContain('<b>my')
  })

  it('keeps both acknowledgements for a wp-cloud site and adds its alert', () => {
    const modal = buildSingleDeleteModal(cloud, t)

    expect(modal.props.alert).toBe('heading.instance.delete.wpCloud.alert')
    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['remove_data', 'remove_database', 'confirm'])
  })
  it('words the dialog for a staging copy and names its domain, escaped (old 24445eb9)', () => {
    const modal = buildSingleDeleteModal({ ...wp, subinstanceLabel: 'staging', domain: 'staging1.<b>x</b>.com' }, t)

    expect(modal.props.title).toBe('heading.instance.delete.staging.title')
    expect(modal.props.message).toBe('heading.instance.delete.staging.message|{"domain":"staging1.&lt;b&gt;x&lt;/b&gt;.com"}')
    expect(modal.props.buttons.map(button => [button.id, button.label])).toEqual([['submit', 'button.deleteStaging'], ['cancel', 'button.cancel']])
    expect(modal.fields.find(field => 'name' in field && field.name === 'confirm')).toMatchObject({ label: 'form.confirmDelete.staging', required: true })
    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['remove_data', 'remove_database', 'confirm'])
  })

  it('keeps the instance wording for a live site', () => {
    const modal = buildSingleDeleteModal({ ...wp, subinstanceLabel: 'live', domain: 'example.com' }, t)

    expect(modal).toEqual(buildMassDeleteModal([wp], t))
  })
})

describe('deleteButtonText', () => {
  it('is Delete Staging for a staging copy and Delete Instance otherwise', () => {
    expect(deleteButtonText({ subinstanceLabel: 'staging' }, t)).toBe('button.deleteStaging')
    expect(deleteButtonText({ subinstanceLabel: 'live' }, t)).toBe('button.deleteInstance|{"count":1}')
    expect(deleteButtonText({}, t)).toBe('button.deleteInstance|{"count":1}')
  })
})

describe('runSingleDelete', () => {
  const values = { remove_data: true, remove_database: true, confirm: true }

  it('deletes with the dialog values, refreshes /home and alerts for one instance', async () => {
    const deps = makeDeps()

    await expect(runSingleDelete(wp, values, deps)).resolves.toBe('deleted')

    expect(deps.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, values)
    expect(deps.refreshHome).toHaveBeenCalledOnce()
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.delete.success|{"count":1}')
  })

  it('alerts the staging text after deleting a staging copy (old 24445eb9)', async () => {
    const deps = makeDeps()

    await expect(runSingleDelete({ ...wp, subinstanceLabel: 'staging' }, values, deps)).resolves.toBe('deleted')

    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.delete.stagingSuccess')
  })

  it('counts a 404 as success', async () => {
    const deps = makeDeps({ deleteInstance: vi.fn().mockRejectedValue({ response: { status: 404 } }) })

    await expect(runSingleDelete(wp, values, deps)).resolves.toBe('deleted')

    expect(deps.addErrorAlert).not.toHaveBeenCalled()
    expect(deps.addSuccessAlert).toHaveBeenCalledOnce()
  })

  it('keeps the dialog open on another error', async () => {
    const deps = makeDeps({ deleteInstance: vi.fn().mockRejectedValue(new Error('nope')) })

    await expect(runSingleDelete(wp, values, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:nope')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('prefetchUpdates', () => {
  it('opens the update modal with the versions and writes the versions to the instance', async () => {
    const deps = makeDeps()
    const instance = { id: 4, status: { wordpress: '6.0.0', wordpress_available: '6.0.0' } }

    const result = await prefetchUpdates(instance, deps)

    expect(deps.getWordpressUpdates).toHaveBeenCalledExactlyOnceWith(4)
    expect(instance.status).toEqual({ wordpress: '6.4.0', wordpress_available: '6.5.0' })
    expect(result.kind).toBe('modal')
    if (result.kind !== 'modal') {
      return
    }
    expect(result.modal.type).toBe('update')
    expect(result.modal.props).toMatchObject({ title: 'heading.instance.update.title', icon: '$update' })
    expect(result.modal.values).toEqual({ version: '6.5.0' })
    expect(result.modal.fields).toMatchObject([
      { name: 'version', type: 'select', tooltip: 'Version', options: [{ label: '6.5.0', value: '6.5.0' }, { label: '6.4.2', value: '6.4.2' }] },
      { name: 'create_backup', type: 'checkbox', tooltip: 'Create Backup' },
    ])
    expect(result.modal.props.buttons.map(button => button.label)).toEqual(['button.update', 'button.cancel'])
  })

  it('takes the highest available version by numeric compare, whatever the order of the list', async () => {
    const instance = { id: 4, status: { wordpress: '9.9.0', wordpress_available: '9.9.0' } }
    await prefetchUpdates(instance, makeDeps({ getWordpressUpdates: vi.fn().mockResolvedValue({ wp_version: '9.9.0', available_updates: ['9.9.1', '10.0.0'] }) }))
    expect(instance.status.wordpress_available).toBe('10.0.0')

    const reversed = { id: 5, status: { wordpress: '9.0.0', wordpress_available: '9.0.0' } }
    await prefetchUpdates(reversed, makeDeps({ getWordpressUpdates: vi.fn().mockResolvedValue({ wp_version: '9.0.0', available_updates: ['11.3.0', '9.0.0'] }) }))
    expect(reversed.status.wordpress_available).toBe('11.3.0')
  })

  it('only alerts when no update is available and keeps the current version as the available one', async () => {
    const deps = makeDeps({ getWordpressUpdates: vi.fn().mockResolvedValue({ wp_version: '6.5.0', available_updates: [] }) })
    const instance = { id: 4, status: { wordpress: '6.0.0', wordpress_available: '6.0.0' } }

    await expect(prefetchUpdates(instance, deps)).resolves.toEqual({ kind: 'no-updates' })

    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('message.noUpdates')
    expect(instance.status.wordpress_available).toBe('6.5.0')
  })

  it('shows the error and opens nothing when the request fails', async () => {
    const deps = makeDeps({ getWordpressUpdates: vi.fn().mockRejectedValue(new Error('down')) })

    await expect(prefetchUpdates({ id: 4 }, deps)).resolves.toEqual({ kind: 'error' })

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:down')
  })
})

describe('runUpdate', () => {
  it('sends the dialog values as the body and alerts', async () => {
    const deps = makeDeps()

    await expect(runUpdate(wp, { version: '6.5.0', create_backup: null }, deps)).resolves.toBe('success')

    expect(deps.updateWordpress).toHaveBeenCalledExactlyOnceWith(1, { version: '6.5.0', create_backup: false })
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.update.success')
  })

  it('keeps the dialog open with the error alert on a failure', async () => {
    const deps = makeDeps({ updateWordpress: vi.fn().mockRejectedValue(new Error('boom')) })

    await expect(runUpdate(wp, { version: '6.5.0' }, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:boom')
  })
})

const plain: CopyService = { id: 10, plan_name: 'Starter', instance_count: 1, instance_limit: 5, hosting_accounts: [{ domain: 'a.example.com' }], onboarding: { user_configurable_options: [] } }
const configurable: CopyService = { id: 11, plan_name: 'Pro', instance_count: 2, instance_limit: 9, hosting_accounts: [], onboarding: { user_configurable_options: [{ name: 'region', type: 'select' }] } }

describe('buildCopyModal', () => {
  it('lists the services with the plan, the limit and the first hosting domain, the first one preselected', () => {
    const modal = buildCopyModal([plain, configurable], t)

    expect(modal.type).toBe('copy')
    expect(modal.props.customClass).toBe('copy-instance-modal')
    expect(modal.props).toMatchObject({ icon: '$copy', title: 'heading.instance.advanced.copyInstance.copy.title' })
    expect(modal.values).toEqual({ service_id: 10 })
    expect(modal.fields).toMatchObject([{
      name: 'service_id',
      type: 'select',
      customClass: 'select-truncate-100',
      options: [
        { label: 'Starter (heading.onboarding.chooseProduct.product.instancesLimit|{"count":1,"limit":"5"}) - a.example.com', value: 10 },
        { label: 'Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":2,"limit":"9"})', value: 11 },
      ],
    }])
  })
})

describe('submitCopy', () => {
  it('copies at once for a service without configurable options', async () => {
    const deps = makeDeps()

    await expect(submitCopy(wp, { service_id: 10 }, [plain, configurable], deps)).resolves.toEqual({ kind: 'copied' })

    expect(deps.getServiceInstanceOptions).not.toHaveBeenCalled()
    expect(deps.copyInstance).toHaveBeenCalledExactlyOnceWith(1, { service_id: 10 })
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.copyInstance.completed')
  })

  it('loads the option values and rebuilds the modal (step 2) for a service with configurable options', async () => {
    const deps = makeDeps()

    const step = await submitCopy(wp, { service_id: 11 }, [plain, configurable], deps)

    expect(deps.getServiceInstanceOptions).toHaveBeenCalledExactlyOnceWith(11)
    expect(deps.copyInstance).not.toHaveBeenCalled()
    expect(step.kind).toBe('options')
    if (step.kind !== 'options') {
      return
    }
    expect(step.modal.type).toBe('copy-options')
    expect(step.modal.props.message).toBe('')
    expect(step.modal.values).toEqual({ service_id: 11, region: 'eu' })
    expect(step.modal.fields).toMatchObject([{
      label: 'form.label.region',
      name: 'region',
      type: 'select',
      options: [{ label: 'EU', value: 'eu' }, { label: 'US', value: 'us' }],
    }])
  })

  it('keeps step 1 with the error alert when the option values fail to load', async () => {
    const deps = makeDeps({ getServiceInstanceOptions: vi.fn().mockRejectedValue(new Error('no')) })

    await expect(submitCopy(wp, { service_id: 11 }, [configurable], deps)).resolves.toEqual({ kind: 'error' })

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:no')
  })
})

describe('runCopy', () => {
  it('sends the other fields as user_configurable_options', async () => {
    const deps = makeDeps()

    await expect(runCopy(wp, { service_id: 11, region: 'us' }, deps)).resolves.toEqual({ kind: 'copied' })

    expect(deps.copyInstance).toHaveBeenCalledExactlyOnceWith(1, { service_id: 11, user_configurable_options: { region: 'us' } })
  })

  it('shows the error and no success alert on a failure', async () => {
    const deps = makeDeps({ copyInstance: vi.fn().mockRejectedValue(new Error('bad')) })

    await expect(runCopy(wp, { service_id: 10 }, deps)).resolves.toEqual({ kind: 'error' })

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:bad')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('push to live modals', () => {
  it('the loading state hides the cancel button behind a Close button and shows the spinner message', () => {
    const modal = buildPushLoadingModal(t)

    expect(modal.type).toBe('push-loading')
    expect(modal.props).toMatchObject({
      title: 'heading.instance.pushToLive.title',
      icon: '$send',
      customClass: 'hide-cancel',
      messageLoader: true,
      messageTitle: 'heading.instance.pushToLoadingState.messageTitle',
      message: 'heading.instance.pushToLoadingState.message',
    })
    expect(modal.props.buttons.map(button => button.id)).toEqual(['close', 'cancel'])
    expect(modal.fields).toEqual([])
  })

  it('the main state has two checkboxes and the two table selects built from the diff', () => {
    const modal = buildPushModal({ databaseDiff: { tables_structure_diff: ['wp_a'], tables_data_diff: ['wp_x', 'wp_y'] } }, t)

    expect(modal.props.buttons.map(button => button.label)).toEqual(['button.pushToLive', 'button.cancel'])
    expect(modal.props.alert).toBeUndefined()
    expect(modal.fields).toMatchObject([
      { name: 'overwrite_files', type: 'checkbox', label: 'form.label.overwriteFiles' },
      { name: 'push_db', type: 'checkbox', label: 'form.label.pushDatabase' },
      { name: 'structural_change_tables', type: 'select', multiple: true, tooltip: 'tooltip.instance.pushToLive.structuralChangeTables', options: [{ label: 'wp_a', value: 'wp_a' }] },
      { name: 'datachange_tables', type: 'select', multiple: true, tooltip: 'tooltip.instance.pushToLive.dataChangeTables', options: [{ label: 'wp_x', value: 'wp_x' }, { label: 'wp_y', value: 'wp_y' }] },
    ])
  })

  it('an unavailable diff shows the alert, hides the selects and starts them empty', () => {
    const modal = buildPushModal({ databaseDiffUnavailable: true }, t)

    expect(modal.props.alert).toBe('heading.instance.pushToLive.databaseDiffUnavailable')
    expect(modal.values).toEqual({ structural_change_tables: [], datachange_tables: [] })
    expect(modal.fields.filter(field => field.hidden).map(field => 'name' in field && field.name)).toEqual(['structural_change_tables', 'datachange_tables'])
  })

  it('the container branch has volumes instead of a database and no selects or alert', () => {
    const modal = buildPushModal({ isContainerPush: true, databaseDiffUnavailable: true }, t)

    expect(modal.props.alert).toBeUndefined()
    expect(modal.fields).toMatchObject([
      { name: 'overwrite_files' },
      { name: 'push_db', label: 'form.label.pushVolumes' },
    ])
    expect(modal.values).toBeUndefined()
  })
})

describe('loadPushModal', () => {
  it('asks for the diff of the staging instance and builds the main state', async () => {
    const deps = makeDeps()

    const modal = await loadPushModal({ id: 41 }, deps)

    expect(deps.getPushToLiveDiff).toHaveBeenCalledExactlyOnceWith(41)
    expect(modal.type).toBe('push')
    expect(modal.fields).toHaveLength(4)
  })

  it('a failed diff request is "diff unavailable"', async () => {
    const deps = makeDeps({ getPushToLiveDiff: vi.fn().mockRejectedValue(new Error('x')) })

    const modal = await loadPushModal({ id: 41 }, deps)

    expect(modal.props.alert).toBe('heading.instance.pushToLive.databaseDiffUnavailable')
  })

  it('a container project skips the request', async () => {
    const deps = makeDeps()

    const modal = await loadPushModal({ id: 41, type: 'custom', isContainer: true }, deps)

    expect(deps.getPushToLiveDiff).not.toHaveBeenCalled()
    expect(modal.fields).toHaveLength(2)
    expect(modal.fields[1]).toMatchObject({ label: 'form.label.pushVolumes' })
  })

  // A PHP hosting project is `custom` too, so the kind cannot come from `type` alone: a staging copy of a WordPress site is
  // `custom` until the WordPress probe refines it.
  it('a classic project without a container asks for the diff and offers the database tables', async () => {
    const deps = makeDeps()

    const modal = await loadPushModal({ id: 41, type: 'custom', isContainer: false }, deps)

    expect(deps.getPushToLiveDiff).toHaveBeenCalledExactlyOnceWith(41)
    expect(modal.fields).toHaveLength(4)
    expect(modal.fields[1]).toMatchObject({ label: 'form.label.pushDatabase' })
    expect(modal.fields.map(field => 'name' in field && field.name)).toEqual(['overwrite_files', 'push_db', 'structural_change_tables', 'datachange_tables'])
  })
})

function makeStagingDeps (overrides: Partial<PushToStagingDeps> = {}): PushToStagingDeps {
  return {
    ...makeDeps(),
    getPushToStagingDiff: vi.fn().mockResolvedValue({ tables_structure_diff: ['wp_a'], tables_data_diff: ['wp_posts'] }),
    pushToStaging: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('push to staging modals', () => {
  it('the loading state uses the staging title and keeps the same shape', () => {
    const modal = buildPushLoadingModal(t, 'staging')

    expect(modal.type).toBe('push-loading')
    expect(modal.props).toMatchObject({ title: 'heading.instance.pushToStaging.title', message: 'heading.instance.pushToLoadingState.message' })
    expect(modal.props.buttons.map(button => button.id)).toEqual(['close', 'cancel'])
  })

  it('the main state has the staging type, title and button, and the same four fields', () => {
    const modal = buildPushModal({ databaseDiff: { tables_structure_diff: ['wp_a'], tables_data_diff: ['wp_x', 'wp_y'] } }, t, 'staging')

    expect(modal.type).toBe('push-staging')
    expect(modal.props.title).toBe('heading.instance.pushToStaging.title')
    expect(modal.props.buttons.map(button => button.label)).toEqual(['button.pushToStaging', 'button.cancel'])
    expect(modal.props.alert).toBeUndefined()
    expect(modal.fields).toMatchObject([
      { name: 'overwrite_files', type: 'checkbox', label: 'form.label.overwriteFiles' },
      { name: 'push_db', type: 'checkbox', label: 'form.label.pushDatabase' },
      { name: 'structural_change_tables', type: 'select', multiple: true, options: [{ label: 'wp_a', value: 'wp_a' }] },
      { name: 'datachange_tables', type: 'select', multiple: true, options: [{ label: 'wp_x', value: 'wp_x' }, { label: 'wp_y', value: 'wp_y' }] },
    ])
  })

  it('an unavailable diff shows the staging alert and starts the selects empty', () => {
    const modal = buildPushModal({ databaseDiffUnavailable: true }, t, 'staging')

    expect(modal.props.alert).toBe('heading.instance.pushToStaging.databaseDiffUnavailable')
    expect(modal.values).toEqual({ structural_change_tables: [], datachange_tables: [] })
  })
})

describe('loadPushStagingModal', () => {
  it('asks for the diff of the live instance and builds the staging main state', async () => {
    const deps = makeStagingDeps()

    const modal = await loadPushStagingModal({ id: 7 }, deps)

    expect(deps.getPushToStagingDiff).toHaveBeenCalledExactlyOnceWith(7)
    expect(deps.getPushToLiveDiff).not.toHaveBeenCalled()
    expect(modal.type).toBe('push-staging')
    expect(modal.fields).toHaveLength(4)
  })

  it('a failed diff request is "diff unavailable" for staging', async () => {
    const deps = makeStagingDeps({ getPushToStagingDiff: vi.fn().mockRejectedValue(new Error('x')) })

    const modal = await loadPushStagingModal({ id: 7 }, deps)

    expect(modal.props.alert).toBe('heading.instance.pushToStaging.databaseDiffUnavailable')
  })

  it('a container project skips the request and has the two checkboxes only', async () => {
    const deps = makeStagingDeps()

    const modal = await loadPushStagingModal({ id: 7, type: 'custom', isContainer: true }, deps)

    expect(deps.getPushToStagingDiff).not.toHaveBeenCalled()
    expect(modal.fields).toHaveLength(2)
    expect(modal.fields[1]).toMatchObject({ label: 'form.label.pushVolumes' })
  })
})

describe('runPushToStaging', () => {
  it('puts to the live id, with untouched checkboxes as false, and shows the staging success alert', async () => {
    const deps = makeStagingDeps()

    await expect(runPushToStaging({ id: 7 }, { overwrite_files: null, push_db: true, structural_change_tables: null, datachange_tables: ['wp_posts'] }, deps)).resolves.toBe('success')

    expect(deps.pushToStaging).toHaveBeenCalledExactlyOnceWith(7, { overwrite_files: false, push_db: true, structural_change_tables: null, datachange_tables: ['wp_posts'] })
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.pushToStaging.success')
  })

  it('shows the error alert and no success alert on a failure', async () => {
    const deps = makeStagingDeps({ pushToStaging: vi.fn().mockRejectedValue(new Error('bad')) })

    await expect(runPushToStaging({ id: 7 }, {}, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:bad')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('runPushToLive', () => {
  it('puts to the staging id, with untouched checkboxes as false and the tables as they are', async () => {
    const deps = makeDeps()

    await expect(runPushToLive({ id: 41 }, { overwrite_files: null, push_db: true, structural_change_tables: null, datachange_tables: ['wp_posts'] }, deps)).resolves.toBe('success')

    expect(deps.pushToLive).toHaveBeenCalledExactlyOnceWith(41, { overwrite_files: false, push_db: true, structural_change_tables: null, datachange_tables: ['wp_posts'] })
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.modal.pushToLive.success')
  })

  it('shows the error alert and no success alert on a failure', async () => {
    const deps = makeDeps({ pushToLive: vi.fn().mockRejectedValue(new Error('bad')) })

    await expect(runPushToLive({ id: 41 }, {}, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:bad')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })

  it('a custom push body has only the two checkboxes', () => {
    expect(buildPushBody({ overwrite_files: true, push_db: null })).toEqual({ overwrite_files: true, push_db: false })
  })
})

describe('runCancelInstallation', () => {
  function cancelDeps (overrides: Partial<CancelInstallDeps> = {}): CancelInstallDeps {
    return { ...makeDeps(), setInstallationStatus: vi.fn(), ...overrides }
  }

  it('shows the row in progress, deletes with both data flags and the acknowledgement, refreshes /home and alerts', async () => {
    const deps = cancelDeps()

    await expect(runCancelInstallation(wp, deps)).resolves.toBe('cancelled')

    expect(deps.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, { remove_data: true, remove_database: true, confirm: true })
    expect(vi.mocked(deps.setInstallationStatus).mock.calls).toEqual([[1, 'in_progress'], [1, 'finished']])
    expect(deps.refreshHome).toHaveBeenCalledOnce()
    expect(deps.addSuccessAlert).toHaveBeenCalledExactlyOnceWith('notification.instance.installation.cancelled')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('counts a 404 (the instance is already gone) as cancelled', async () => {
    const deps = cancelDeps({ deleteInstance: vi.fn().mockRejectedValue({ response: { status: 404 } }) })

    await expect(runCancelInstallation(wp, deps)).resolves.toBe('cancelled')

    expect(deps.addSuccessAlert).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.setInstallationStatus).mock.calls.at(-1)).toEqual([1, 'finished'])
  })

  it('marks the row failed and shows the error when the request fails', async () => {
    const deps = cancelDeps({ deleteInstance: vi.fn().mockRejectedValue(new Error('nope')) })

    await expect(runCancelInstallation(wp, deps)).resolves.toBe('error')

    expect(vi.mocked(deps.setInstallationStatus).mock.calls).toEqual([[1, 'in_progress'], [1, 'failed']])
    expect(deps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('msg:nope')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
    expect(deps.refreshHome).not.toHaveBeenCalled()
  })
})
