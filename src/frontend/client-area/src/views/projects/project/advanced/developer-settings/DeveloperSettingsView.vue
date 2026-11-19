<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.developer.title')">
      <InstanceModeCard
        v-if="instance.hasManageDebugModePrivilege()"
        :loading="debugMode.fetching"
        :saving="debugMode.saving"
        :status="debugMode.status"
        subtitle-key="heading.instance.advanced.developer.debug.subtitle"
        title-key="heading.instance.advanced.developer.debug.title"
        @toggle="onModeToggle('debug-mode')"
      />

      <InstanceModeCard
        v-if="instance.hasManageMaintenanceModePrivilege()"
        :loading="maintenanceMode.fetching"
        :saving="maintenanceMode.saving"
        :status="maintenanceMode.status"
        subtitle-key="heading.instance.advanced.developer.maintenance.subtitle"
        title-key="heading.instance.advanced.developer.maintenance.title"
        @toggle="onModeToggle('maintenance-mode')"
      />

      <SsoLoginCard
        v-if="instance.hasControlPanelSsoPrivilege()"
        button-key="button.login.controlPanel"
        :loading="controlPanelLoading"
        subtitle-key="heading.instance.advanced.developer.controlpanel.subtitle"
        title-key="heading.instance.advanced.developer.controlpanel.title"
        @login="onControlPanelLogin"
      />

      <SsoLoginCard
        v-if="instance.hasPhpmyadminSsoPrivilege()"
        button-key="button.login.phpmyadmin"
        :loading="phpmyadminSso.state.loading"
        subtitle-key="heading.instance.advanced.developer.phpmyadmin.subtitle"
        title-key="heading.instance.advanced.developer.phpmyadmin.title"
        @login="onPhpmyadminLogin"
      />

      <template v-if="phpHosting">
        <PhpVersionCard
          v-if="instance.hasChangePhpVersionPrivilege()"
          :current-version="phpCurrentVersion"
          :loading="phpCurrentVersionLoading"
          :versions-loading="phpVersionsLoading"
          @manage="openPhpVersionModal"
        />

        <v-col
          v-if="instance.hasManagePhpSettingsPrivilege()"
          class="pb-2"
          cols="12"
        >
          <PhpSettingsCard :instance="instance" />
        </v-col>
      </template>

      <v-col
        v-else-if="showPhpContainerNote"
        class="pb-2"
        cols="12"
      >
        <AppMessage
          data-testid="developer-php-container"
          variant="info"
        >
          <p>{{ t('message.hosting.php.containerProject') }}</p>
        </AppMessage>
      </v-col>
    </AdvancedPageLayout>

    <PhpMyAdminSsoDialogs :sso="phpmyadminSso" />

    <PhpVersionModal
      v-if="phpHosting && instance.hasChangePhpVersionPrivilege()"
      v-model:open="phpVersionModalOpen"
      :current-version="phpCurrentVersion"
      :instance="instance"
      :versions="phpVersions"
      @update:current-version="phpCurrentVersion = $event"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceMode } from '@/entities/project/instance-modes.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, reactive, ref } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { clearInstanceModeCache, getInstanceMode, updateInstanceMode } from '@/entities/project/instance-modes.api'
  import PhpMyAdminSsoDialogs from '@/entities/sso/ui/PhpMyAdminSsoDialogs.vue'
  import { useControlPanelSso } from '@/entities/sso/use-control-panel-sso'
  import { usePhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import { getPhpVersion, getPhpVersions, type PhpVersion } from './developer-settings.api'
  import InstanceModeCard from './InstanceModeCard.vue'
  import PhpSettingsCard from './PhpSettingsCard.vue'
  import PhpVersionCard from './PhpVersionCard.vue'
  import PhpVersionModal from './PhpVersionModal.vue'
  import SsoLoginCard from './SsoLoginCard.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  // The account details carry the phpMyAdmin SSO host; the resource types them `unknown`, so only this field is named here.
  interface HostingAccountDetailsLike {
    mysql_php_my_admin_sso_host?: string
  }

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // The API refuses the PHP version and settings of a container (dind) project, whose PHP comes from its own image.
  const phpHosting = computed(() => !props.instance.isContainer)
  const showPhpContainerNote = computed(() => !phpHosting.value
    && (props.instance.hasChangePhpVersionPrivilege() || props.instance.hasManagePhpSettingsPrivilege()))

  // One shared composable, the loader is its `loading`.
  const { open: openControlPanel, loading: controlPanelLoading } = useControlPanelSso()

  function onControlPanelLogin (): void {
    void openControlPanel(props.instance.hostingId as number)
  }

  // The login uses the instance's server type and SSO host; the dialogs are rendered once below.
  const phpmyadminSso = usePhpMyAdminSso()

  function onPhpmyadminLogin (): void {
    const details = props.instance.hostingAccountDetails as HostingAccountDetailsLike | undefined
    void phpmyadminSso.login(
      props.instance.hostingId as number,
      props.instance.hostingServerType,
      details?.mysql_php_my_admin_sso_host,
    )
  }

  interface ModeState {
    fetching: boolean
    saving: boolean
    status: boolean | null
  }

  const debugMode = reactive<ModeState>({ fetching: true, saving: false, status: null })
  const maintenanceMode = reactive<ModeState>({ fetching: true, saving: false, status: null })

  function stateOf (mode: InstanceMode): ModeState {
    return mode === 'debug-mode' ? debugMode : maintenanceMode
  }

  /** A plain GET with its own skeleton. A failure alerts and keeps `null`, so the switch stays disabled. */
  async function fetchMode (mode: InstanceMode): Promise<void> {
    const state = stateOf(mode)
    state.fetching = true
    try {
      state.status = await getInstanceMode(props.instance.id, mode)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      state.fetching = false
    }
  }

  /** Unlike legacy, the setter gets the new value and the cached mode is cleared. */
  async function saveMode (mode: InstanceMode): Promise<void> {
    const state = stateOf(mode)
    const next = !state.status
    state.saving = true
    try {
      await updateInstanceMode(props.instance.id, mode, next)
      if (mode === 'debug-mode') {
        props.instance.setDebugMode(next)
      } else {
        props.instance.setMaintenanceMode(next)
      }
      clearInstanceModeCache(props.instance.id, mode)
      state.status = next
      alerts.addAlert({ success: true, successMessage: t('notification.instance.settings.update') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      state.saving = false
    }
  }

  /** Guard: a click while that mode is saving does nothing, so there is no second PUT. An unknown state does nothing too. */
  function onModeToggle (mode: InstanceMode): void {
    if (stateOf(mode).saving || stateOf(mode).status === null) {
      return
    }
    void saveMode(mode)
  }

  const phpCurrentVersion = ref<PhpVersion | null>(null)
  const phpCurrentVersionLoading = ref(true)
  const phpVersions = ref<PhpVersion[]>([])
  const phpVersionsLoading = ref(false)
  const phpVersionModalOpen = ref(false)

  useMobileScrollLock(phpVersionModalOpen)

  /** A cached GET with its own skeleton. A failure alerts and keeps `null`. */
  async function fetchPhpVersion (): Promise<void> {
    phpCurrentVersionLoading.value = true
    try {
      phpCurrentVersion.value = await getPhpVersion(props.instance.hostingId as number, props.instance.domain ?? '')
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      phpCurrentVersionLoading.value = false
    }
  }

  /** The list loads behind the Manage loader; the modal opens only after it arrives. */
  async function openPhpVersionModal (): Promise<void> {
    phpVersionsLoading.value = true
    try {
      phpVersions.value = await getPhpVersions(props.instance.hostingId as number)
      phpVersionModalOpen.value = true
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      phpVersionsLoading.value = false
    }
  }

  onMounted(() => {
    if (phpHosting.value && props.instance.hasChangePhpVersionPrivilege()) {
      void fetchPhpVersion()
    } else {
      phpCurrentVersionLoading.value = false
    }
    if (props.instance.hasManageDebugModePrivilege()) {
      void fetchMode('debug-mode')
    } else {
      debugMode.fetching = false
    }
    if (props.instance.hasManageMaintenanceModePrivilege()) {
      void fetchMode('maintenance-mode')
    } else {
      maintenanceMode.fetching = false
    }
  })
</script>
