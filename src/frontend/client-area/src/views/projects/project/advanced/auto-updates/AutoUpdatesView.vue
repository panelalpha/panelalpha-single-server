<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.autoUpdates.title')">
      <v-col
        v-if="!fetchingAutoUpdates && blockedBy.length > 0"
        class="pt-4 pb-2"
        cols="12"
      >
        <AppMessage
          class="auto-updates-alert mb-0"
          role="alert"
          variant="warning"
        >
          <p>{{ t('heading.instance.advanced.autoUpdates.blockedBy', { constants: blockedBy.join(', ') }) }}</p>
        </AppMessage>
      </v-col>

      <v-col
        v-if="hasWordpressAutoUpdates(instance.auto_updates)"
        class="pt-4 pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.autoUpdates.upgrade.subtitle')"
          :loading="fetchingAutoUpdates"
          :title="t('heading.instance.advanced.autoUpdates.upgrade.title')"
        >
          <template #action>
            <ButtonSwitch
              :loading="submitAutoUpgrades"
              :model-value="!!settings.auto_update"
              @click="onToggleAutoUpgrades"
            />
          </template>

          <template
            v-if="settings.auto_update"
            #footer
          >
            <v-select
              hide-details
              :items="autoUpdateItems"
              :menu-props="{ offset: 4 }"
              :model-value="settings.auto_update"
              variant="outlined"
              @update:model-value="onAutoUpdateChange"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pt-4 pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.autoUpdates.upgrade.plugin.subtitle')"
          :loading="fetchingAutoUpdates"
          :title="t('heading.instance.advanced.autoUpdates.upgrade.plugin.title')"
        >
          <template
            v-if="isPluginsPartial(settings)"
            #alert
          >
            <p class="mb-0 text-warning">
              {{ t('heading.instance.advanced.autoUpdates.upgrade.plugin.partial') }}
            </p>
          </template>

          <template #action>
            <ButtonSwitch
              :loading="submitAutoUpgradePlugins"
              :model-value="!!settings.auto_update_plugins"
              @click="onToggleAutoUpgradePlugins"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pt-4 pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.autoUpdates.upgrade.theme.subtitle')"
          :loading="fetchingAutoUpdates"
          :title="t('heading.instance.advanced.autoUpdates.upgrade.theme.title')"
        >
          <template #action>
            <ButtonSwitch
              :loading="submitAutoUpgradeThemes"
              :model-value="!!settings.auto_update_themes"
              @click="onToggleAutoUpgradeThemes"
            />
          </template>
        </SettingCard>
      </v-col>
    </AdvancedPageLayout>
  </div>
</template>

<script lang="ts" setup>
  // The blocked-by alert (app only), the title, the WordPress core card (shown only with `can_auto_updates.wordpress`, with the version select while
  // it is on), the plugins card (with the app-only partial text) and the themes card. The switches and the select save through
  // one PUT and a re-GET (`saveChanges`). The scoped SCSS is not in legacy (no `<style>`).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, type Ref, ref } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import {
    AUTO_UPDATE_OPTIONS,
    hasWordpressAutoUpdates,
    isPluginsPartial,
    selectBody,
    toggleBody,
    updaterBlockedBy,
  } from './auto-updates-settings'
  import { type AutoUpdatesBody, type AutoUpdatesSettings, getAutoUpdates, updateAutoUpdates } from './auto-updates.api'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const settings = ref<AutoUpdatesSettings>({})
  const fetchingAutoUpdates = ref(true)
  const submitAutoUpgrades = ref(false)
  const submitAutoUpgradePlugins = ref(false)
  const submitAutoUpgradeThemes = ref(false)

  const autoUpdateItems = computed(() => AUTO_UPDATE_OPTIONS.map(option => ({
    title: t(option.labelKey),
    value: option.value,
  })))

  /** App only: the WordPress constants that block the updater. Lite sends no field, so the alert stays hidden. */
  const blockedBy = computed(() => updaterBlockedBy(settings.value))

  /** A failure alerts and leaves `settings` empty, so every switch stays off. */
  async function fetchAutoUpdates (): Promise<void> {
    fetchingAutoUpdates.value = true
    try {
      settings.value = await getAutoUpdates(props.instance.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingAutoUpdates.value = false
    }
  }

  /** The GET after a successful save. A failure is swallowed, so the old value stays and no alert shows. */
  async function refreshAutoUpdates (): Promise<void> {
    try {
      settings.value = await getAutoUpdates(props.instance.id)
    } catch {
      // Swallowed as in legacy: state unchanged, no alert.
    }
  }

  /**
   * The card flag shows the loader, the PUT goes first, then on success the success
   * alert and a re-GET; on a failed PUT only the error alert, no re-GET. `finally` clears the flag. The skeleton does not return here,
   * because `fetchingAutoUpdates` changes only in the first GET.
   *
   * The new value is shown at once: the Engine runs WordPress for both calls, so the switch would sit in its old position
   * for the whole round trip (seconds) after a save the server accepts, and for ever when the re-GET fails.
   */
  async function saveChanges (body: AutoUpdatesBody, flag: Ref<boolean>): Promise<void> {
    flag.value = true
    const saved = settings.value
    settings.value = { ...saved, ...body }
    try {
      await updateAutoUpdates(props.instance.id, body)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.settings.update') })
      await refreshAutoUpdates()
    } catch (error) {
      settings.value = saved
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      flag.value = false
    }
  }

  /**
   * Deviation: while any save is in flight, a click on any card or the select is ignored. Legacy let the clicks through, so a second
   * PUT could race the first one. The per-card flags stay only to show the loader on the right switch.
   */
  function isSaving (): boolean {
    return submitAutoUpgrades.value || submitAutoUpgradePlugins.value || submitAutoUpgradeThemes.value
  }

  /** The switch sends `!current ? 1 : 0` for `auto_update`, with the other two fields kept. */
  function onToggleAutoUpgrades (): void {
    if (isSaving()) {
      return
    }
    void saveChanges(toggleBody(settings.value, 'auto_update'), submitAutoUpgrades)
  }

  /** Deviation as in `onToggleAutoUpgrades`: a click during a save is ignored. */
  function onToggleAutoUpgradePlugins (): void {
    if (isSaving()) {
      return
    }
    void saveChanges(toggleBody(settings.value, 'auto_update_plugins'), submitAutoUpgradePlugins)
  }

  /** Deviation as in `onToggleAutoUpgrades`: a click during a save is ignored. */
  function onToggleAutoUpgradeThemes (): void {
    if (isSaving()) {
      return
    }
    void saveChanges(toggleBody(settings.value, 'auto_update_themes'), submitAutoUpgradeThemes)
  }

  /**
   * Deviation: the select is controlled (`:model-value` = the saved value, no local copy), so
   * after a failed PUT it shows the saved value again, and after a successful save the value from the re-GET. A click during a save is
   * ignored and the select keeps the saved value. `saveChanges` shows the picked value while the PUT is in flight.
   */
  function onAutoUpdateChange (value: number): void {
    if (isSaving()) {
      return
    }
    void saveChanges(selectBody(settings.value, value), submitAutoUpgrades)
  }

  onMounted(() => {
    void fetchAutoUpdates()
  })
</script>
