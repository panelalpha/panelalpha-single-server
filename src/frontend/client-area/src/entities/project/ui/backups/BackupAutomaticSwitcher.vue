<template>
  <div
    v-if="instance.hasManageAutoBackupPrivilege()"
    class="backup-switcher d-flex justify-space-between justify-center align-center"
    data-testid="automatic-backup-switcher"
  >
    <div class="d-flex flex-column justify-center w-100">
      <h6
        v-if="!small"
        class="font-weight-light"
      >
        <template v-if="!loading">
          {{ t('heading.instance.siteDetails.security.automaticBackup.title') }}
        </template>

        <v-skeleton-loader
          v-else
          class="bg-text title-skeleton title-skeleton--big"
          height="24px"
          type="text"
          width="200px"
        />
      </h6>

      <p
        v-else
        class="mb-0 p-2 gray-text"
      >
        <span v-if="!loading">{{ t('general.backup') }}</span>

        <v-skeleton-loader
          v-else
          class="bg-text title-skeleton"
          type="text"
        />
      </p>

      <p
        v-if="!loading && settings.frequency !== 'never' && displaySettings"
        class="p-4 mb-0 line-16"
        :class="displayedSettingsClass"
        @click="openEditSettingsModal"
      >
        <span>{{ displaySettings }}</span>

        <b
          v-if="!small && editable"
          class="text-info ms-1"
        >{{ t('button.change') }}</b>
      </p>

      <div
        v-else
        class="w-100 d-flex align-center"
      >
        <v-skeleton-loader
          v-if="loading"
          class="bg-text text-skeleton"
          type="text"
        />

        <span
          v-else-if="noStore"
          class="text-warning font-weight-bold d-flex align-center"
          data-testid="backup-store-unavailable"
        >
          <v-icon
            color="warning"
            icon="$alertwarning"
            size="16"
          />

          <span class="p-3 ml-2 mt-1">{{ t(BACKUP_STORE_MISSING_STATUS.key, { defaultValue: BACKUP_STORE_MISSING_STATUS.defaultValue }) }}</span>
        </span>

        <span
          v-else-if="!instance.server_settings?.uses_own_backup_system"
          class="text-error font-weight-bold d-flex align-center"
        >
          <v-icon
            color="error"
            icon="$alertwarning"
            size="16"
          />

          <span class="p-3 ml-2 mt-1">{{ t('message.status.disabled') }}</span>
        </span>

        <span
          v-else
          class="text-success font-weight-bold d-flex align-center"
        >
          <v-icon
            color="success"
            icon="$alertok"
            size="16"
          />

          <span class="p-3 ml-2 mt-1">{{ t('message.status.enabled') }}</span>
        </span>
      </div>

      <!-- The reason under the status, on its own line. The Backups page hides it: its notice says the same. -->
      <p
        v-if="!loading && noStore && storeHint"
        class="configure-store gray-text p-4 mb-0 mt-1"
      >
        {{ t(BACKUP_STORE_MISSING_HINT.key, { defaultValue: BACKUP_STORE_MISSING_HINT.defaultValue }) }}

        <router-link
          v-if="freePanel"
          class="text-info font-weight-bold"
          :to="{ path: '/settings', query: { tab: 'backups' } }"
        >
          {{ t(BACKUP_STORE_SET_UP_SHORT.key, { defaultValue: BACKUP_STORE_SET_UP_SHORT.defaultValue }) }}
        </router-link>
      </p>
    </div>

    <v-dialog
      v-model="modalOpen"
      transition="custom-dialog-transition"
      width="560px"
    >
      <div
        class="card-overlay"
        @click="modalOpen = !modalOpen"
      />

      <AutomaticBackupsModal
        class="automatic-backups-modal"
        :edit="edit"
        :instance-id="instance.id"
        :open="modalOpen"
        :settings="settings"
        @modal-close="modalClose"
        @reload-settings="emit('reload-settings')"
      />
    </v-dialog>

    <div
      v-if="loading"
      class="d-flex align-center"
    >
      <v-skeleton-loader
        class="bg-text switch-skeleton"
        type="heading"
      />
    </div>

    <v-menu
      v-else-if="!instance.server_settings?.uses_own_backup_system && !noStore"
      v-model="confirmationOpen"
      :close-on-content-click="false"
      content-class="attached"
      location="bottom end"
      min-width="290px"
      :offset="8"
      :open-on-click="false"
      transition="slide-y-transition"
      width="290px"
      :z-index="9999"
    >
      <template #activator="{ props: activatorProps }">
        <template v-if="!asButton && editable">
          <ButtonSwitch
            class="flex-shrink-0"
            v-bind="activatorProps"
            :model-value="computedEnabled"
            @click="handleSwitchChange"
          />
        </template>

        <template v-else-if="asButton">
          <AppButton
            v-if="editable"
            v-bind="activatorProps"
            class="mt-0 pt-0"
            kind="secondary"
            size="x-small"
            @click="handleSwitchChange"
          >
            <span class="heading--text font-weight-bold p-4">
              <span v-if="computedEnabled">{{ t('button.disable') }}</span>

              <span v-else>{{ t('button.activate') }}</span>
            </span>
          </AppButton>
        </template>
      </template>

      <AutomaticBackupsConfirmation
        :instance="instance"
        :settings="settings"
        @card-close="confirmationOpen = false"
        @reload-settings="emit('reload-settings')"
      />
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
  // Opening the settings modal or the disable confirmation is driven by
  // `handleSwitchChange`; the menu does not open on its own click (legacy bound only the activator attributes).
  import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { isAutomaticBackupEnabled, isBackupStoreMissing, scheduleMessage } from './automatic-backup'
  import AutomaticBackupsConfirmation from './AutomaticBackupsConfirmation.vue'
  import AutomaticBackupsModal from './AutomaticBackupsModal.vue'
  import { BACKUP_STORE_MISSING_HINT, BACKUP_STORE_MISSING_STATUS, BACKUP_STORE_SET_UP_SHORT } from './backup-store-missing'

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    settings: AutomaticBackupSettings
    loading?: boolean
    small?: boolean
    asButton?: boolean
    editable?: boolean
    // The host reads the session and passes it (the kit does not read it).
    freePanel?: boolean
    // Without a backup store: the reason under the status. Off where the page shows `BackupStoreMissingNotice` already.
    storeHint?: boolean
  }>(), {
    loading: false,
    small: false,
    asButton: false,
    editable: false,
    freePanel: false,
    storeHint: true,
  })

  const emit = defineEmits<{
    'reload-settings': []
  }>()

  const { t } = useTranslation()

  const edit = ref(false)
  const modalOpen = ref(false)
  const confirmationOpen = ref(false)

  useBodyScrollLock(modalOpen)

  const computedEnabled = computed(() => isAutomaticBackupEnabled(props.settings))
  // Engine 2.2 reports `store_configured: false`; `undefined` (older Engine) changes nothing.
  // An enabled schedule keeps its switch so it can still be turned off.
  const noStore = computed(() => isBackupStoreMissing(props.settings, props.instance.server_settings?.uses_own_backup_system) && !computedEnabled.value)
  const translate = (key: string, params?: Record<string, unknown>): string => String(t(key, params ?? {}))
  const displaySettings = computed(() => scheduleMessage(props.settings, translate))

  const displayedSettingsClass = computed(() => {
    const classes: string[] = []
    if (props.instance.automatic_backups_editable) {
      classes.push('cursor-pointer', props.small ? 'info--text-hover' : 'text-info')
    }
    return classes.join(' ')
  })

  function modalClose (): void {
    edit.value = false
    modalOpen.value = false
  }

  function openSettingsModal (): void {
    modalOpen.value = true
  }

  function openEditSettingsModal (): void {
    if (props.instance.automatic_backups_editable) {
      edit.value = true
      openSettingsModal()
    }
  }

  function handleSwitchChange (): void {
    if (!props.editable) {
      return
    }
    if (computedEnabled.value) {
      confirmationOpen.value = true
    } else {
      openSettingsModal()
    }
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `x-small` is 32px (`$btn-sizes`); V4 `x-small` is 24px.
.v-btn--size-x-small {
  --v-btn-height: #{map.get(v.$btn-sizes, x-small) * 1px};
}

// Width 560px as an inline style in app-lite. `_dialog.scss` sets the card
// to 720px at specificity (0,4,0), so the class is doubled and anchored under the dialog overlay to win over it.
.v-dialog .v-overlay__content .automatic-backups-modal.automatic-backups-modal {
  width: 560px;
}

// The schedule text may wrap (legacy), but the box must not shrink below its title plus the switch. The switch input has no min-content
// width of its own, so the flex item went under its content and the switch overlapped the search field next to it.
.backup-switcher {
  min-width: min-content;

  :deep(.switch-container) {
    min-width: max-content;
  }
}

h6 {
  font-size: 16px;
  line-height: 24px;
  font-weight: 300;
  white-space: nowrap;
}

.title-skeleton.v-skeleton-loader,
.text-skeleton.v-skeleton-loader,
.switch-skeleton.v-skeleton-loader {
  display: flow-root;
  color: inherit;
}

// V2 text bone: full width, 12px tall, 6px bottom margin (V4: 16px margins on every side).
.title-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__text),
.text-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  margin: 0 0 6px;
}

.title-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  max-width: 100px;
  height: 16px;
  padding: 3px 0;
}

.title-skeleton--big.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  width: 160px;
  max-width: 160px;
  height: 16px;
  padding: 3px 0;
  margin-right: 16px;
}

.text-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  max-width: 160px;
  height: 13px;
  padding: 2.5px 0;
}

.switch-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__heading) {
  width: 45px;
  height: 28px;
  margin: 0;
  border-radius: 100px;
  padding: 1px 0;
}

// Legacy `.info--text-hover:hover` used `!important`. The class is doubled (specificity 0,4,0 with the scoped attribute)
// so the token colour wins over the host card rules without it. No host passes `small` (BackupsView and SecurityInfoCard both use the
// default), so this hover is unreachable today and was never measured: verify it with the first host that passes `small`.
.info--text-hover.info--text-hover:hover {
  color: rgb(var(--v-theme-info));
}

.cursor-pointer {
  cursor: pointer;
}

.line-16 {
  line-height: 16px;
  height: 16px;
}
</style>
