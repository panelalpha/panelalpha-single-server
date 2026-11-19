import type { Ref } from 'vue'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { useTranslation } from 'i18next-vue'
import {
  activatePlugin,
  deactivatePlugin,
  deletePlugin,
  installPlugin,
  updatePlugin,
} from '@/entities/project/instance-plugins.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { emit as emitAppEvent } from '@/shared/events/app-events'
import { useActionModal } from '@/shared/ui/modal/use-action-modal'
import {
  buildActivateModal,
  buildDeactivateModal,
  buildDeleteModal,
  buildInstallModal,
  buildMassActivateModal,
  buildMassDeactivateModal,
  buildMassDeleteModal,
  buildMassUpdateModal,
  buildUpdateModal,
} from './plugin-actions'

// The single-plugin dialogs and the mass ones of the selection, run through `useActionModal`
// (the dialog state and the busy flag). Legacy closes the dialog in `finally`, so a failure closes it too, after the error alert.

/** The part of `usePluginsPage` the actions need: the full list from the delete's answer and the reload after a write. */
export interface PluginsPageHandle {
  setItems: (list: InstalledPlugin[]) => void
  loadData: () => Promise<void>
  /** Keeps the catalogue title and description for the card of a plugin in install (its API row has none). */
  rememberInstalling: (catalogue: RepositoryPlugin) => void
}

/** The part of the selection the mass actions need: a successful mass action clears it. */
export interface PluginsSelectionHandle {
  clear: () => void
}

export interface PluginActionsOptions {
  instance: Ref<InstanceResource>
  page: PluginsPageHandle
  selection: PluginsSelectionHandle
}

/** A single-plugin dialog carries one plugin, a mass dialog the list of the selection; the install dialog carries a catalogue entry. */
type PluginTarget = InstalledPlugin | RepositoryPlugin | InstalledPlugin[]

function singleTarget (target: PluginTarget | null): InstalledPlugin | null {
  return target && !Array.isArray(target) ? target as InstalledPlugin : null
}

function massTarget (target: PluginTarget | null): InstalledPlugin[] {
  return Array.isArray(target) ? target : []
}

/**
 * One request after another, not in
 * parallel. Every failure is collected and returned, so the caller can alert the unique messages.
 */
async function runInTurn (plugins: InstalledPlugin[], request: (plugin: InstalledPlugin) => Promise<void>): Promise<string[]> {
  const errors: string[] = []
  for (const plugin of plugins) {
    try {
      await request(plugin)
    } catch (error) {
      errors.push(getErrorMessage(error))
    }
  }
  return errors
}

export function usePluginActions ({ instance, page, selection }: PluginActionsOptions) {
  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const succeed = (message: string) => alerts.addAlert({ success: true, successMessage: message })
  const fail = (error: unknown) => alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
  const instanceId = () => instance.value.id

  const dialog = useActionModal<PluginTarget>({
    'plugin-activate': {
      async run (_values, ctx) {
        const plugin = singleTarget(ctx.target)
        if (!plugin) {
          return
        }
        try {
          await activatePlugin(instanceId(), plugin.name)
          succeed(t('notification.instance.plugin.activate.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'plugin-deactivate': {
      async run (_values, ctx) {
        const plugin = singleTarget(ctx.target)
        if (!plugin) {
          return
        }
        try {
          await deactivatePlugin(instanceId(), plugin.name)
          succeed(t('notification.instance.plugin.deactivate.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'plugin-update': {
      async run (_values, ctx) {
        const plugin = singleTarget(ctx.target)
        if (!plugin) {
          return
        }
        try {
          await updatePlugin(instanceId(), plugin.name)
          // The list and the instance
          // take the new status through the same subscriber as the Echo event.
          emitAppEvent('plugin-item-changed', { ...plugin, async_status: { update: 'pending' } })
          succeed(t('notification.instance.plugin.update.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'plugin-delete': {
      async run (_values, ctx) {
        const plugin = singleTarget(ctx.target)
        if (!plugin) {
          return
        }
        try {
          // The DELETE answers with the full list, so the page does not reload.
          const list = await deletePlugin(instanceId(), plugin.name)
          succeed(t('notification.instance.plugin.delete.success', { count: 1 }))
          page.setItems(list)
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'plugin-install': {
      async run (_values, ctx) {
        const catalogue = ctx.target as RepositoryPlugin | null
        if (!catalogue) {
          return
        }
        try {
          await installPlugin(instanceId(), catalogue.slug)
          page.rememberInstalling(catalogue)
          // The catalogue entry shows the spinner until the list drops it.
          emitAppEvent('plugin-item-changed', { ...catalogue, async_status: { install: 'pending' } })
          succeed(t('notification.instance.plugin.install.success'))
          // The installed list picks the plugin up and the catalogue drops it.
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'plugin-mass-activate': {
      async run (_values, ctx) {
        const plugins = massTarget(ctx.target)
        try {
          const errors = await runInTurn(plugins, plugin => activatePlugin(instanceId(), plugin.name))
          if (errors.length === 0) {
            succeed(t('notification.instance.plugin.activate.success', { count: plugins.length }))
            selection.clear()
          } else {
            failEach(errors)
          }
        } finally {
          ctx.close()
          void page.loadData()
        }
      },
    },
    'plugin-mass-deactivate': {
      async run (_values, ctx) {
        const plugins = massTarget(ctx.target)
        try {
          const errors = await runInTurn(plugins, plugin => deactivatePlugin(instanceId(), plugin.name))
          if (errors.length === 0) {
            succeed(t('notification.instance.plugin.deactivate.success', { count: plugins.length }))
            selection.clear()
          } else {
            failEach(errors)
          }
        } finally {
          ctx.close()
          void page.loadData()
        }
      },
    },
    'plugin-mass-update': {
      async run (_values, ctx) {
        // Only the plugins that have an update are sent, in parallel (`Promise.all`).
        const names = massTarget(ctx.target).filter(plugin => plugin.update === 'available').map(plugin => plugin.name)
        try {
          await Promise.all(names.map(name => updatePlugin(instanceId(), name)))
          succeed(t('notification.instance.plugin.update.success_other', { count: names.length }))
          selection.clear()
        } catch (error) {
          fail(error)
        } finally {
          // Reloaded on a failure too, like the mass activate and deactivate: the requests that did succeed show (legacy reloaded on success only).
          ctx.close()
          void page.loadData()
        }
      },
    },
    'plugin-mass-delete': {
      async run (_values, ctx) {
        const plugins = massTarget(ctx.target)
        try {
          await Promise.all(plugins.map(plugin => deletePlugin(instanceId(), plugin.name)))
          succeed(t('notification.instance.plugin.delete.success', { count: plugins.length }))
          selection.clear()
        } catch (error) {
          fail(error)
        } finally {
          // Reloaded on a failure too: the plugins that were deleted leave the list (legacy reloaded on success only).
          ctx.close()
          void page.loadData()
        }
      },
    },
  })

  // Legacy alerts each distinct error once (`[...new Set(errors)]`).
  function failEach (errors: string[]): void {
    for (const errorMessage of new Set(errors)) {
      alerts.addAlert({ success: false, errorMessage })
    }
  }

  return {
    modal: dialog.modal,
    modalOpen: dialog.modalOpen,
    submitting: dialog.submitting,
    render: dialog.render,
    values: dialog.values,
    persistent: dialog.persistent,
    close: dialog.close,
    setValues: dialog.setValues,
    onButton: dialog.onButton,
    openActivate: (plugin: InstalledPlugin) => dialog.open(buildActivateModal(t, plugin), plugin),
    openDeactivate: (plugin: InstalledPlugin) => dialog.open(buildDeactivateModal(t, plugin), plugin),
    openUpdate: (plugin: InstalledPlugin) => dialog.open(buildUpdateModal(t, plugin), plugin),
    openInstall: (plugin: RepositoryPlugin) => dialog.open(buildInstallModal(t, plugin), plugin),
    openDelete: (plugin: InstalledPlugin) => dialog.open(buildDeleteModal(t, plugin), plugin),
    openMassActivate: (plugins: InstalledPlugin[]) => dialog.open(buildMassActivateModal(t, plugins), plugins),
    openMassDeactivate: (plugins: InstalledPlugin[]) => dialog.open(buildMassDeactivateModal(t, plugins), plugins),
    openMassUpdate: (plugins: InstalledPlugin[]) => dialog.open(buildMassUpdateModal(t, plugins), plugins),
    openMassDelete: (plugins: InstalledPlugin[]) => dialog.open(buildMassDeleteModal(t, plugins), plugins),
  }
}
