import type { CopyInstanceBody, PushDatabaseDiff, PushToLiveBody, ServiceInstanceOptions, WordpressUpdateBody, WordpressUpdates } from './instance-actions.api'
import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import type { ActionModal, MassActionDeps, MassDeleteOutcome } from '@/entities/project/action-modal'
import { buildMassDeleteModal, runMassDelete } from '@/entities/project/action-modal'
import { isContainerProject } from '@/entities/project/container-project'
import { targetItemBox } from '@/entities/project/target-item-box'
import { serviceLabel } from '@/entities/service/service-display'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'
import { highestVersion } from '@/shared/version/compare-versions'

// Builders and runners of the single-instance row actions, shared by the list kebab and the instance page.
// The builders return the kit
// `BasicModal` options like the mass ones (`ActionModal`); the API calls and alerts come in through `MassActionDeps`.

/** The same title as the mass modal, `count: 1`, no icon. */
export function buildClearCacheModal (_instance: { id: number }, t: Translate): ActionModal {
  return {
    type: 'clear-cache',
    props: {
      title: t('heading.instance.clearCache.title'),
      message: t('heading.instance.clearCache.message', { count: 1 }),
      icon: '',
      buttons: [{ id: 'submit', label: t('button.clearCache'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * One PUT, the success alert or the error alert. The dialog closes whatever the
 * outcome (`finally`), so the caller closes it after this resolves.
 */
export async function runClearCache (instance: { id: number }, deps: MassActionDeps): Promise<'success' | 'error'> {
  try {
    await deps.clearInstanceCache(instance.id)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.modal.clearCache.success'))
  return 'success'
}

/** The mass builder with one item (`count: 1`, wp-cloud alert, required confirm). */
// Legacy does not name the project, and a staging copy has its own menu right under the
// parent, so the dialog shows the project name in the grey target box (escaped; no new copy).
// A staging copy gets its own wording (title, message with the
// staging domain, button, confirm checkbox) so it is clear that only the copy goes and the live site stays.
export function buildSingleDeleteModal (
  instance: { id: number, hostingServerType?: string, type?: string, title?: string, subinstanceLabel?: string, domain?: string },
  t: Translate,
): ActionModal {
  let modal = buildMassDeleteModal([instance], t)
  if (instance.subinstanceLabel === 'staging') {
    modal = {
      ...modal,
      props: {
        ...modal.props,
        title: t('heading.instance.delete.staging.title'),
        message: t('heading.instance.delete.staging.message', { domain: escapeHtml(instance.domain ?? '') }),
        buttons: modal.props.buttons.map(button => button.id === 'submit' ? { ...button, label: t('button.deleteStaging') } : button),
      },
      fields: modal.fields.map(field => 'name' in field && field.name === 'confirm' ? { ...field, label: t('form.confirmDelete.staging') } : field),
    }
  }
  const name = instance.title?.trim()
  if (!name) {
    return modal
  }
  return { ...modal, props: { ...modal.props, targetBox: targetItemBox(escapeHtml(name)) } }
}

/** The delete label of a project menu or top bar: `Delete Staging` for a staging copy, `Delete Instance` otherwise. */
export function deleteButtonText (instance: { subinstanceLabel?: string }, t: Translate): string {
  return instance.subinstanceLabel === 'staging' ? t('button.deleteStaging') : t('button.deleteInstance', { count: 1 })
}

/** The mass runner with one item (404 counts as success). */
export function runSingleDelete (
  instance: { id: number, subinstanceLabel?: string },
  values: Record<string, unknown>,
  deps: MassActionDeps,
): Promise<MassDeleteOutcome> {
  if (instance.subinstanceLabel !== 'staging') {
    return runMassDelete([instance], values, deps)
  }
  // The staging copy has its own success text.
  return runMassDelete([instance], values, {
    ...deps,
    t: (key, params) => key === 'notification.instance.modal.delete.success' ? deps.t('notification.instance.modal.delete.stagingSuccess') : deps.t(key, params),
  })
}

/** What the row actions need beyond the mass ones: the update and copy requests. */
export interface RowActionDeps extends MassActionDeps {
  getWordpressUpdates: (id: number) => Promise<WordpressUpdates>
  updateWordpress: (id: number, body: WordpressUpdateBody) => Promise<unknown>
  getServiceInstanceOptions: (serviceId: number | string) => Promise<ServiceInstanceOptions>
  copyInstance: (id: number, body: CopyInstanceBody) => Promise<unknown>
  getPushToLiveDiff: (stagingId: number) => Promise<PushDatabaseDiff>
  pushToLive: (stagingId: number, body: PushToLiveBody) => Promise<unknown>
}

/** The instance as far as the update prefetch touches it: `showUpdateModal` writes the WordPress versions onto `status`. */
export interface UpdatableInstance {
  id: number
  status?: { wordpress?: string | null, wordpress_available?: string | null }
}

export type UpdatePrefetch = { kind: 'modal', modal: ActionModal } | { kind: 'no-updates' } | { kind: 'error' }

/** Version select (first version preselected) and the backup checkbox. */
export function buildUpdateModal (availableUpdates: string[], t: Translate): ActionModal {
  const options = availableUpdates.map(version => ({ label: version, value: version }))
  return {
    type: 'update',
    props: {
      title: t('heading.instance.update.title'),
      message: '',
      icon: '$update',
      buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [
      // The tooltips are raw legacy strings, not i18n keys (`tooltip: "Version"`); the kit translates them as a key.
      { label: t('form.label.version'), tooltip: 'Version', name: 'version', type: 'select', options },
      { label: t('form.label.createBackup'), tooltip: 'Create Backup', name: 'create_backup', type: 'checkbox' },
    ],
    width: MODAL_WIDTH,
    persistent: false,
    values: { version: options[0]?.value ?? null },
  }
}

/**
 * `GET .../wordpress/updates`, the versions written
 * to the instance, then the modal, or only the `message.noUpdates` alert when nothing is available.
 */
export async function prefetchUpdates (instance: UpdatableInstance, deps: RowActionDeps): Promise<UpdatePrefetch> {
  let updates: WordpressUpdates
  try {
    updates = await deps.getWordpressUpdates(instance.id)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return { kind: 'error' }
  }

  applyWordpressVersions(instance, updates)

  const available = updates.available_updates ?? []
  if (available.length === 0) {
    deps.addSuccessAlert(deps.t('message.noUpdates'))
    return { kind: 'no-updates' }
  }
  return { kind: 'modal', modal: buildUpdateModal(available, deps.t) }
}

/**
 * Writes the live WordPress versions onto the instance: `status.wordpress` is the core version the Engine reports and
 * `status.wordpress_available` the greatest version it can be updated to (legacy sorted the strings; here the
 * greatest is found by numeric version compare, see `compare-versions.ts`).
 */
export function applyWordpressVersions (instance: UpdatableInstance, updates: WordpressUpdates): void {
  const available = updates.available_updates ?? []
  if (!updates.wp_version || !instance.status) {
    return
  }

  instance.status.wordpress = updates.wp_version
  instance.status.wordpress_available = highestVersion(available) ?? updates.wp_version
}

/** The dialog values are the body (the backup box as a boolean); the dialog stays open on an error. */
export async function runUpdate (instance: { id: number }, values: Record<string, unknown>, deps: RowActionDeps): Promise<'success' | 'error'> {
  try {
    await deps.updateWordpress(instance.id, { ...values, create_backup: values.create_backup === true } as WordpressUpdateBody)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.modal.update.success'))
  return 'success'
}

/** What the copy steps need of the row actions: the options and the copy requests, the alerts, the error text and `t`. */
export type CopyDeps = Pick<RowActionDeps, 'getServiceInstanceOptions' | 'copyInstance' | 'addSuccessAlert' | 'addErrorAlert' | 'getErrorMessage' | 't'>

/** A `/home` service as the copy modal reads it. */
export interface CopyService {
  id: number | string
  plan_name?: string
  instance_count?: number
  instance_limit?: number
  hosting_accounts?: Array<{ domain?: string }>
  onboarding?: { user_configurable_options?: Array<{ name: string, type: string }> }
}

/** Step 1, the service select with the first service preselected. */
export function buildCopyModal (services: CopyService[], t: Translate): ActionModal {
  const options = services.map(service => ({ label: serviceLabel(service, t), value: service.id }))
  return {
    type: 'copy',
    props: {
      title: t('heading.instance.advanced.copyInstance.copy.title'),
      message: t('heading.instance.advanced.copyInstance.modal.selectService.message'),
      icon: '$copy',
      customClass: 'copy-instance-modal',
      buttons: [{ id: 'submit', label: t('button.copyInstance'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [{ name: 'service_id', type: 'select', customClass: 'select-truncate-100', options }],
    width: MODAL_WIDTH,
    persistent: false,
    values: { service_id: options[0]?.value ?? null },
  }
}

/** A user configurable option as a service lists it (`onboarding.user_configurable_options`). */
export interface UserConfigurableOptionDef {
  name: string
  type?: unknown
}

/** One field of the user configurable options: its label, and the values of a select (`{ label, value }`). */
export interface UserConfigurableField {
  name: string
  type: string
  label: string
  options: Array<{ label: string, value: unknown }>
}

/**
 * The fields of a service's user configurable options, shared by the copy dialog (`selectUserConfigurableOptions`)
 * and the onboarding UCO step. Each field takes its values from `optionValues`
 * (`GET /services/{id}/instance-options`). A value in `preset` wins over the first value (the onboarding account config).
 */
export function buildUserConfigurableFields (
  options: readonly UserConfigurableOptionDef[],
  optionValues: ServiceInstanceOptions,
  t: Translate,
  preset: Readonly<Record<string, unknown>> = {},
): { fields: UserConfigurableField[], values: Record<string, unknown> } {
  const values: Record<string, unknown> = {}
  const fields: UserConfigurableField[] = []
  for (const option of options) {
    const items = (optionValues[option.name] ?? []).map(item => ({ label: item.text, value: item.value }))
    fields.push({ label: t(`form.label.${option.name}`), name: option.name, type: String(option.type ?? ''), options: items })
    values[option.name] = preset[option.name] === undefined ? (items[0]?.value ?? null) : preset[option.name]
  }
  return { fields, values }
}

/** Step 2, one field per option, the first value preselected. */
export function buildCopyOptionsModal (service: CopyService, optionValues: ServiceInstanceOptions, t: Translate): ActionModal {
  const built = buildUserConfigurableFields(service.onboarding?.user_configurable_options ?? [], optionValues, t)
  const values: Record<string, unknown> = { service_id: service.id, ...built.values }
  const fields: ModalField[] = built.fields.map(field => ({ label: field.label, name: field.name, type: field.type as 'select', options: field.options }))
  return {
    type: 'copy-options',
    props: {
      title: t('heading.instance.advanced.copyInstance.copy.title'),
      message: '',
      icon: '$copy',
      buttons: [{ id: 'submit', label: t('button.copyInstance'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields,
    width: MODAL_WIDTH,
    persistent: false,
    values,
  }
}

export type CopyStep = { kind: 'options', modal: ActionModal } | { kind: 'copied' } | { kind: 'error' }

/**
 * The copy button: a service with user configurable options first loads their values
 * (`GET /services/{id}/instance-options`) and rebuilds the modal (step 2); any other service copies at once. A failed options
 * request keeps step 1 open with the error alert (legacy rebuilt the dialog and then threw).
 */
export async function submitCopy (
  instance: { id: number },
  values: Record<string, unknown>,
  services: CopyService[],
  deps: CopyDeps,
): Promise<CopyStep> {
  const service = services.find(item => item.id === values.service_id)
  if (service?.onboarding?.user_configurable_options?.length) {
    let optionValues: ServiceInstanceOptions
    try {
      optionValues = await deps.getServiceInstanceOptions(service.id)
    } catch (error) {
      deps.addErrorAlert(deps.getErrorMessage(error))
      return { kind: 'error' }
    }
    return { kind: 'options', modal: buildCopyOptionsModal(service, optionValues, deps.t) }
  }
  return runCopy(instance, values, deps)
}

/** `service_id` plus every other field as `user_configurable_options`. */
export async function runCopy (instance: { id: number }, values: Record<string, unknown>, deps: CopyDeps): Promise<{ kind: 'copied' } | { kind: 'error' }> {
  const { service_id: serviceId, ...rest } = values
  const body: CopyInstanceBody = { service_id: serviceId as CopyInstanceBody['service_id'] }
  if (Object.keys(rest).length > 0) {
    body.user_configurable_options = rest
  }
  try {
    await deps.copyInstance(instance.id, body)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return { kind: 'error' }
  }
  deps.addSuccessAlert(deps.t('notification.instance.copyInstance.completed'))
  return { kind: 'copied' }
}

/** The push direction: `live` pushes the staging copy to its live site, `staging` pushes the live site to its staging copy. */
export type PushDirection = 'live' | 'staging'

// The keys that differ between the two directions. The fields and the loading state's messages are shared.
const PUSH_KEYS = {
  live: {
    type: 'push',
    title: 'heading.instance.pushToLive.title',
    unavailable: 'heading.instance.pushToLive.databaseDiffUnavailable',
    button: 'button.pushToLive',
    success: 'notification.instance.modal.pushToLive.success',
  },
  staging: {
    type: 'push-staging',
    title: 'heading.instance.pushToStaging.title',
    unavailable: 'heading.instance.pushToStaging.databaseDiffUnavailable',
    button: 'button.pushToStaging',
    success: 'notification.instance.modal.pushToStaging.success',
  },
} as const

/** Loading state: a Close button, the hidden cancel and a spinner message. */
export function buildPushLoadingModal (t: Translate, direction: PushDirection = 'live'): ActionModal {
  return {
    type: 'push-loading',
    props: {
      title: t(PUSH_KEYS[direction].title),
      message: t('heading.instance.pushToLoadingState.message'),
      icon: '$send',
      customClass: 'hide-cancel',
      messageLoader: true,
      messageTitle: t('heading.instance.pushToLoadingState.messageTitle'),
      messageTitleClass: 'text-center',
      messageClass: 'text-center',
      // The legacy Close button is unshifted before the reset cancel button, which `hide-cancel` hides.
      buttons: [{ id: 'close', label: t('button.close'), type: 'cancel', color: 'normal' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

export interface PushModalOptions {
  databaseDiff?: PushDatabaseDiff | null
  databaseDiffUnavailable?: boolean
  /** A container project: volumes instead of a database, no table selects (the Engine compares tables only for PHP hosting projects). */
  isContainerPush?: boolean
}

/** The push form fields, with the app-lite custom branch. */
export function buildPushFields (options: PushModalOptions, t: Translate): ModalField[] {
  const { databaseDiff, databaseDiffUnavailable, isContainerPush } = options
  const structureChanges: Array<{ label: string, value: string }> = []
  const dataChanges: Array<{ label: string, value: string }> = []
  if (!databaseDiffUnavailable && databaseDiff) {
    for (const table of databaseDiff.tables_structure_diff ?? []) {
      structureChanges.push({ label: table, value: table })
    }
    for (const table of databaseDiff.tables_data_diff ?? []) {
      dataChanges.push({ label: table, value: table })
    }
  }
  const fields: ModalField[] = [
    { label: t('form.label.overwriteFiles'), name: 'overwrite_files', type: 'checkbox' },
    { label: t(isContainerPush ? 'form.label.pushVolumes' : 'form.label.pushDatabase'), name: 'push_db', type: 'checkbox' },
  ]
  if (isContainerPush) {
    return fields
  }
  fields.push(
    {
      label: t('form.label.structuralChangeTables'),
      name: 'structural_change_tables',
      tooltip: 'tooltip.instance.pushToLive.structuralChangeTables',
      type: 'select',
      multiple: true,
      options: structureChanges,
      hidden: databaseDiffUnavailable,
    },
    {
      label: t('form.label.dataChangeTables'),
      name: 'datachange_tables',
      tooltip: 'tooltip.instance.pushToLive.dataChangeTables',
      type: 'select',
      multiple: true,
      options: dataChanges,
      hidden: databaseDiffUnavailable,
    },
  )
  return fields
}

/** Main state; the staging direction is the same dialog with its own keys. */
export function buildPushModal (options: PushModalOptions, t: Translate, direction: PushDirection = 'live'): ActionModal {
  const unavailable = Boolean(options.databaseDiffUnavailable) && !options.isContainerPush
  const keys = PUSH_KEYS[direction]
  return {
    type: keys.type,
    props: {
      title: t(keys.title),
      message: '',
      icon: '$send',
      ...(unavailable ? { alert: t(keys.unavailable) } : {}),
      buttons: [{ id: 'submit', label: t(keys.button), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: buildPushFields(options, t),
    width: MODAL_WIDTH,
    persistent: false,
    ...(unavailable ? { values: { structural_change_tables: [], datachange_tables: [] } } : {}),
  }
}

/**
 * The diff of the staging instance decides the modal.
 * A container project has no compared database, so it skips the GET with an empty diff; a failed GET is "diff unavailable".
 * A PHP hosting project is `custom` too until the WordPress probe refines it, so the kind comes from `is_container`.
 */
export async function loadPushModal (staging: { id: number, type?: string, isContainer?: boolean }, deps: RowActionDeps): Promise<ActionModal> {
  if (isContainerProject({ type: staging.type, isContainer: Boolean(staging.isContainer) })) {
    return buildPushModal({ isContainerPush: true, databaseDiff: { tables_structure_diff: [], tables_data_diff: [] } }, deps.t)
  }
  try {
    return buildPushModal({ databaseDiff: await deps.getPushToLiveDiff(staging.id) }, deps.t)
  } catch {
    return buildPushModal({ databaseDiffUnavailable: true }, deps.t)
  }
}

/** The PUT body: the dialog values, an untouched (`null`) checkbox sent as `false`. */
export function buildPushBody (values: Record<string, unknown>): PushToLiveBody {
  return {
    ...values,
    overwrite_files: Boolean(values.overwrite_files),
    push_db: Boolean(values.push_db),
  } as PushToLiveBody
}

/**
 * `PUT /instances/{stagingId}/push-to-live`. The id is the staging instance's
 * (the table passes the live one as the row item, so the caller hands in the sub-row). The dialog stays open on an error.
 */
export async function runPushToLive (staging: { id: number }, values: Record<string, unknown>, deps: RowActionDeps): Promise<'success' | 'error'> {
  try {
    await deps.pushToLive(staging.id, buildPushBody(values))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.modal.pushToLive.success'))
  return 'success'
}

/** What the push to staging needs beyond the row actions: the diff and the PUT of `instance-actions.api.ts`. */
export interface PushToStagingDeps extends RowActionDeps {
  getPushToStagingDiff: (liveId: number) => Promise<PushDatabaseDiff>
  pushToStaging: (liveId: number, body: PushToLiveBody) => Promise<unknown>
}

/**
 * The same branches as `loadPushModal`, with the diff of the live
 * instance (the id the request takes). A container project skips the GET; a failed GET is "diff unavailable".
 */
export async function loadPushStagingModal (live: { id: number, type?: string, isContainer?: boolean }, deps: PushToStagingDeps): Promise<ActionModal> {
  if (isContainerProject({ type: live.type, isContainer: Boolean(live.isContainer) })) {
    return buildPushModal({ isContainerPush: true, databaseDiff: { tables_structure_diff: [], tables_data_diff: [] } }, deps.t, 'staging')
  }
  try {
    return buildPushModal({ databaseDiff: await deps.getPushToStagingDiff(live.id) }, deps.t, 'staging')
  } catch {
    return buildPushModal({ databaseDiffUnavailable: true }, deps.t, 'staging')
  }
}

/**
 * `PUT /instances/{liveId}/push-to-staging`, the body as push to live builds it.
 * The dialog stays open on an error, as for push to live.
 */
export async function runPushToStaging (live: { id: number }, values: Record<string, unknown>, deps: PushToStagingDeps): Promise<'success' | 'error'> {
  try {
    await deps.pushToStaging(live.id, buildPushBody(values))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }
  deps.addSuccessAlert(deps.t('notification.instance.modal.pushToStaging.success'))
  return 'success'
}

/** What the cancel runner needs beyond the mass deps: the optimistic `async_status.installation` of the row. */
export interface CancelInstallDeps extends MassActionDeps {
  setInstallationStatus: (id: number, value: 'in_progress' | 'finished' | 'failed') => void
}

export type CancelInstallOutcome = 'cancelled' | 'error'

/**
 * The row shows
 * `in_progress` while `DELETE /instances/{id}` runs with both data flags and the dialog's acknowledgement, then `/home`
 * refreshes and the alert shows. A 404 means the instance is already gone (as the delete runners count it). The caller emits
 * `instance-deleted` on `cancelled`.
 */
export async function runCancelInstallation (instance: { id: number }, deps: CancelInstallDeps): Promise<CancelInstallOutcome> {
  deps.setInstallationStatus(instance.id, 'in_progress')
  try {
    await deps.deleteInstance(instance.id, { remove_data: true, remove_database: true, confirm: true })
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status !== 404) {
      deps.setInstallationStatus(instance.id, 'failed')
      deps.addErrorAlert(deps.getErrorMessage(error))
      return 'error'
    }
  }
  void deps.refreshHome().catch(() => undefined)
  deps.setInstallationStatus(instance.id, 'finished')
  deps.addSuccessAlert(deps.t('notification.instance.installation.cancelled'))
  return 'cancelled'
}
