import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(join(here, file), 'utf8')

const instancesView = read('InstancesView.vue')
const instanceItem = read('InstanceItem.vue')
const instanceNoData = read('InstanceNoData.vue')
const accountView = readFileSync(join(here, '../account/profile/MyAccountView.vue'), 'utf8')
const instancesStore = read('instances.store.ts')
// The bar's shell (select all, deselect) is the kit `SelectSnackbar`.
const snackbar = read('InstanceActionSnackbar.vue') + read('../../shared/ui/selection/SelectSnackbar.vue')
const itemActions = read('InstanceItemActions.vue')
const installationPending = read('InstanceCardImgInstallationPending.vue')
const importPending = read('InstanceCardImgImportPending.vue')
// `cancelButton` (`button.cancel`) moved to the kit, the other builders stay in the project entity.
const massActions = read('instance-mass-actions.ts') + readFileSync(join(here, '../../entities/project/action-modal.ts'), 'utf8') + readFileSync(join(here, '../../shared/ui/modal/action-modal.ts'), 'utf8')
const shareModal = read('../../entities/project/ui/ShareInstanceModal.vue') + read('../../entities/project/ui/ShareInviteForm.vue')
const shareItem = read('../../entities/project/ui/SharePersonCell.vue') + read('../../entities/project/ui/ShareRoleSelect.vue') + read('../../entities/project/ui/ShareAccessTable.vue') + read('../../entities/project/ui/ShareInviteForm.vue')
const shareOwner = read('../../entities/project/ui/SharePersonCell.vue') + read('../../entities/project/ui/ShareRoleSelect.vue')
const shareInstance = read('../../entities/project/ui/share-instance.ts')
const customPrivileges = read('../../entities/project/ui/ShareCustomPrivileges.vue')
const deployPending = read('InstanceCardImgDeployPending.vue')
const dropZone = read('InstancesDropZone.vue')
const deployLogsModal = readFileSync(join(here, '../../entities/project/ui/deploy/DeployLogsModal.vue'), 'utf8')
const issueResolve = read('../../entities/project/use-issue-resolve.ts')
const massDropFiles = readFileSync(join(here, '../../shared/files/drop-files.ts'), 'utf8')

describe('legacy i18n keys', () => {
  it('uses heading.instance.title for the instances page title', () => {
    expect(instancesView).toContain(`t('heading.instance.title')`)
    expect(instancesView).not.toContain(`t('instances.title')`)
  })

  it('uses heading.instance.titleProjects for the project list title under single server', () => {
    expect(instancesView).toContain(`t('heading.instance.titleProjects')`)
  })

  it('uses the legacy lite keys of the custom card, the deploy logs, the drop zone and the issue resolve', () => {
    for (const key of ['button.manage', 'button.openProject', 'deployLogs.deployFailed', 'deployLogs.deployInProgress', 'deployLogs.showLogs', 'deployLogs.downloadLog', 'deployLogs.cancelDeploy']) {
      expect(itemActions).toContain(`'${key}'`)
    }
    expect(deployPending).toContain(`t('deployLogs.deployFailed')`)
    expect(deployPending).toContain(`t('deployLogs.deployInProgress')`)
    expect(dropZone).toContain(`t('heading.instance.dropOverlay.title')`)
    for (const key of ['deployLogs.title', 'deployLogs.live', 'deployLogs.liveHint', 'deployLogs.noDeploys', 'deployLogs.noDeploysSubtitle', 'deployLogs.cancelDeploy', 'deployLogs.cancelConfirmTitle', 'deployLogs.downloadLog', 'button.confirm', 'button.cancel', 'button.close']) {
      expect(deployLogsModal).toContain(`'${key}'`)
    }
    expect(issueResolve).toContain('notification.instance.files.redeploy.inProgress')
    expect(issueResolve).toContain('notification.instance.files.redeploy.failed')
    for (const key of ['heading.onboarding.zipDeploy.file.empty', 'heading.onboarding.zipDeploy.file.invalidType', 'heading.onboarding.zipDeploy.file.maxSelections', 'heading.onboarding.zipDeploy.file.readFailed']) {
      expect(massDropFiles).toContain(`'${key}'`)
    }
  })

  it('uses heading.accountPage.title for the account page title', () => {
    expect(accountView).toContain(`t('heading.accountPage.title')`)
    expect(accountView).not.toContain(`t('account.title')`)
  })

  it('does not hard-code Failed to load instances in the store', () => {
    expect(instancesStore).not.toContain('Failed to load instances')
  })

  it('uses legacy keys for the per-page "all" option, the card and the empty list', () => {
    expect(instancesView).toContain(`t('general.all')`)
    expect(instanceItem).toContain(`t('message.serviceSuspended')`)
    expect(instanceItem).toContain(`t('message.status.instance.notAvailable')`)
    expect(instanceNoData).toContain(`t('message.emptyTable.instances.title')`)
    expect(instanceNoData).toContain(`t('message.emptyTable.projects.subtitle'`)
    expect(instanceNoData).toContain(`t('button.instance.create')`)
    expect(instanceNoData).toContain(`t('general.greeting'`)
    expect(instanceNoData).toContain(`t('general.adventurer')`)
  })

  it('uses the legacy keys of the selection bar, the card overlay and the pending images', () => {
    for (const key of ['table.snackbar.selected.instance', 'button.share', 'button.remove', 'table.snackbar.selectAll', 'table.snackbar.deselect']) {
      expect(snackbar).toContain(`'${key}'`)
    }
    for (const key of ['button.site.manage', 'button.wpAdmin', 'message.notPreview.title', 'button.why', 'message.managementNotAvailable', 'button.try', 'button.import.details', 'button.import.cancel', 'button.installation.cancel', 'notification.instance.installation.inProgress']) {
      expect(itemActions).toContain(`'${key}'`)
    }
    for (const key of ['message.status.install.failed', 'message.status.install.inProgress', 'message.status.install.success']) {
      expect(installationPending).toContain(`'${key}'`)
    }
    for (const key of ['message.status.importing.failed', 'message.status.importing.inProgress', 'message.status.import.success', 'message.importing.modal.progress']) {
      expect(importPending).toContain(`'${key}'`)
    }
  })

  it('uses the legacy keys of the mass dialogs and the share dialog', () => {
    for (const key of [
      'heading.instance.delete.title', 'heading.instance.delete.message', 'heading.instance.delete.wpCloud.alert', 'button.deleteInstance',
      'form.confirmDelete.instanceFiles_one', 'form.confirmDelete.instanceFiles_other', 'form.confirmDelete.instanceDatabase_one',
      'form.confirmDelete.instanceDatabase_other', 'message.confirmAction', 'form.confirmDelete.instance',
      'heading.instance.unsuspend.title', 'heading.instance.unsuspend.message', 'button.unsuspend', 'button.cancel',
      'notification.instance.modal.delete.success',
    ]) {
      expect(massActions).toContain(`'${key}'`)
    }
    expect(massActions).not.toContain(`form.label.removeData`)
    expect(massActions).not.toContain(`form.label.removeDatabase`)
    for (const key of [
      'heading.instance.modal.sharedAccess.title.other', 'heading.instance.modal.sharedAccess.title.one', 'form.label.user.choose', 'form.label.role',
      'form.label.loginAs', 'button.sharedAccess.invite', 'heading.instance.modal.sharedAccess.stagingQuestion', 'button.sharedAccess.pending',
      'notification.instance.sharedAccess.invite.success', 'notification.instance.sharedAccess.update.success',
      'notification.instance.sharedAccess.delete.success', 'notification.instance.sharedAccess.resendInvite.success',
    ]) {
      expect(shareModal).toContain(`'${key}'`)
    }
    expect(shareItem).toContain(`'tooltip.sharedAccess.removeAccess'`)
    expect(shareOwner).toContain(`'general.owner'`)
    expect(shareInstance).toContain(`'form.option.sharedAccess.loginAs.allUsers'`)
    expect(customPrivileges).toContain(`'heading.instance.modal.sharedAccess.privileges.title'`)
  })

  it('drops the custom instances.* copy of the pre-migration list', () => {
    for (const source of [instancesView, instanceItem, instanceNoData, instancesStore, snackbar, itemActions, installationPending, importPending, massActions, shareModal, shareItem, shareOwner, shareInstance, customPrivileges]) {
      expect(source).not.toMatch(/['"`]instances\.(common|style|sortBy|perPage|select|filteredEmpty|empty)/)
    }
    expect(instancesView).not.toContain('instances.common.error')
  })

  it('does not import axios in a view', () => {
    for (const source of [instancesView, instanceItem, snackbar, itemActions, installationPending, importPending, massActions, shareModal, shareItem, shareOwner, customPrivileges]) {
      expect(source).not.toContain(`from 'axios'`)
      expect(source).not.toContain(`'@/shared/api/client'`)
    }
  })

  it('leaves no file of the pre-migration list behind', () => {
    for (const file of [
      'InstancesGrid.vue', 'InstancesTable.vue', 'InstancesMassActionBar.vue', 'ClearCacheDialog.vue', 'DeleteInstancesDialog.vue',
      'InstancesEmptyState.vue', 'InstancesFilteredEmpty.vue', 'instances.mapper.ts', 'instances.helpers.ts',
    ]) {
      expect(existsSync(join(here, file))).toBe(false)
    }
  })
})
