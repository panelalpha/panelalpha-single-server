import type { Ref } from 'vue'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { useTranslation } from 'i18next-vue'
import { activateTheme, deleteTheme, installTheme, updateTheme } from '@/entities/project/instance-themes.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { emit as emitAppEvent } from '@/shared/events/app-events'
import { isDemoMode } from '@/shared/session/demo-mode'
import { useActionModal } from '@/shared/ui/modal/use-action-modal'
import { planMassDelete } from './installed-themes'
import { buildActivateModal, buildDeleteModal, buildInstallModal, buildMassDeleteModal, buildMassUpdateModal, buildUpdateModal } from './theme-actions'

// The single-theme dialogs and the mass ones of the selection run through `useActionModal` (the dialog state and the busy flag), as `use-plugin-actions.ts` does for plugins.
// Legacy closes the dialog in `finally`, so a failure closes it too, after the alert. The list is reloaded after a write, in `finally` for the mass actions.

/** The part of `useThemesPage` the actions need: the full list (the mass delete looks the active theme up in it) and the reload after a write. */
export interface ThemesPageHandle {
  allItems: Ref<InstalledTheme[]>
  loadData: () => Promise<void>
}

/** The part of the selection the mass actions need: a successful mass action clears it. */
export interface ThemesSelectionHandle {
  clear: () => void
}

export interface ThemeActionsOptions {
  instance: Ref<InstanceResource>
  page: ThemesPageHandle
  selection: ThemesSelectionHandle
}

/** A single-theme dialog carries one theme, a mass dialog the list of the selection; the install dialog carries a catalogue entry. */
type ThemeTarget = InstalledTheme | RepositoryTheme | InstalledTheme[]

function singleTarget (target: ThemeTarget | null): InstalledTheme | null {
  return target && !Array.isArray(target) ? target as InstalledTheme : null
}

function massTarget (target: ThemeTarget | null): InstalledTheme[] {
  return Array.isArray(target) ? target : []
}

export function useThemeActions ({ instance, page, selection }: ThemeActionsOptions) {
  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const succeed = (message: string) => alerts.addAlert({ success: true, successMessage: message })
  const fail = (error: unknown) => alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
  const instanceId = () => instance.value.id

  const dialog = useActionModal<ThemeTarget>({
    'theme-install': {
      async run (_values, ctx) {
        const catalogue = ctx.target as RepositoryTheme | null
        if (!catalogue) {
          return
        }
        try {
          await installTheme(instanceId(), catalogue.slug)
          // The catalogue entry shows the spinner until the list drops it.
          emitAppEvent('theme-item-changed', { ...catalogue, async_status: { install: 'pending' } })
          succeed(t('notification.instance.theme.install.success'))
          // The installed list picks the theme up and the catalogue drops it.
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'theme-activate': {
      async run (_values, ctx) {
        const theme = singleTarget(ctx.target)
        if (!theme) {
          return
        }
        try {
          await activateTheme(instanceId(), theme.name)
          succeed(t('notification.instance.theme.activate.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'theme-update': {
      async run (_values, ctx) {
        const theme = singleTarget(ctx.target)
        if (!theme) {
          return
        }
        try {
          await updateTheme(instanceId(), theme.name)
          // The card and the row show the spinner through the same subscriber as the Echo event.
          emitAppEvent('theme-item-changed', { ...theme, async_status: { update: 'pending' } })
          succeed(t('notification.instance.theme.update.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'theme-delete': {
      async run (_values, ctx) {
        const theme = singleTarget(ctx.target)
        if (!theme) {
          return
        }
        try {
          // The answer is ignored and the list is reloaded, unlike plugins.
          await deleteTheme(instanceId(), theme.name)
          succeed(t('notification.instance.theme.delete.success', { count: 1 }))
          void page.loadData()
        } catch (error) {
          fail(error)
        } finally {
          ctx.close()
        }
      },
    },
    'theme-mass-update': {
      async run (_values, ctx) {
        // Every selected theme is sent, in parallel.
        const themes = massTarget(ctx.target)
        try {
          await Promise.all(themes.map(theme => updateTheme(instanceId(), theme.name)))
          succeed(t('notification.instance.theme.update.success', { count: themes.length }))
          selection.clear()
        } catch (error) {
          fail(error)
        } finally {
          // Reloaded on a failure too: the themes that were updated show their new version (legacy reloaded on success only).
          ctx.close()
          void page.loadData()
        }
      },
    },
    'theme-mass-delete': {
      async run (_values, ctx) {
        // The active theme is looked up in the full list. A selected active theme is skipped with the alert. With nothing left to delete, legacy closed the dialog with no request and no reload.
        const { toDelete, skippedActive } = planMassDelete(massTarget(ctx.target), page.allItems.value, isDemoMode())
        if (skippedActive) {
          alerts.addAlert({ success: false, errorMessage: t('notification.instance.theme.delete.error') })
        }
        if (toDelete.length === 0) {
          ctx.close()
          return
        }
        try {
          await Promise.all(toDelete.map(theme => deleteTheme(instanceId(), theme.name)))
          succeed(t('notification.instance.theme.delete.success', { count: toDelete.length }))
          selection.clear()
        } catch (error) {
          fail(error)
        } finally {
          // Reloaded on a failure too: the themes that were deleted leave the list (legacy reloaded on success only).
          ctx.close()
          void page.loadData()
        }
      },
    },
  })

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
    openInstall: (theme: RepositoryTheme) => dialog.open(buildInstallModal(t, theme), theme),
    openActivate: (theme: InstalledTheme) => dialog.open(buildActivateModal(t, theme), theme),
    openUpdate: (theme: InstalledTheme) => dialog.open(buildUpdateModal(t, theme), theme),
    openDelete: (theme: InstalledTheme) => dialog.open(buildDeleteModal(t, theme), theme),
    openMassUpdate: (themes: InstalledTheme[]) => dialog.open(buildMassUpdateModal(t, themes), themes),
    openMassDelete: (themes: InstalledTheme[]) => dialog.open(buildMassDeleteModal(t, themes), themes),
  }
}
