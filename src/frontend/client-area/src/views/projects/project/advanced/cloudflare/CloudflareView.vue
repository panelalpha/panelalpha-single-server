<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.cloudflare.title')">
      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cloudflare.manage.subtitle')"
          :loading="isLoading"
          :title="t('heading.instance.advanced.cloudflare.manage.title')"
          title-tag="h5"
        >
          <template #action>
            <div class="d-flex align-center cloudflare-status">
              <span class="me-1">{{ t('heading.instance.advanced.cloudflare.manage.label') }}</span>

              <StatusLabel
                v-if="cloudflareActivated"
                class="ms-3"
                status="success"
                :value="t('message.status.active')"
              />

              <v-menu
                v-else
                content-class="cloudflare-nameservers-menu"
                location="bottom start"
                min-width="300"
                :offset="4"
                open-delay="150"
                open-on-hover
                transition="custom-tooltip"
                z-index="99"
              >
                <template #activator="{ props: activatorProps }">
                  <StatusLabel
                    v-bind="activatorProps"
                    status="error"
                    :value="t('message.status.wrongDns')"
                  />
                </template>

                <ul class="pa-2">
                  <NameserverListItem
                    v-for="(item, index) in instance.dns_nameservers ?? []"
                    :key="`dnsRecord${index}`"
                    :index="index"
                    :item="item"
                  />
                </ul>
              </v-menu>
            </div>

            <AppButton
              kind="setting-action"
              @click="openDnsRecords"
            >
              <span class="font-weight-bold">{{ t('button.cloudflare.manage') }}</span>
            </AppButton>
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cloudflare.cache.subtitle')"
          :loading="isLoading"
          :title="t('heading.instance.advanced.cloudflare.cache.title')"
          title-tag="h5"
        >
          <template #alert>
            <AlertSm
              class="alert-sm--primary"
              :text="t('heading.instance.advanced.cloudflare.cache.alert')"
            />
          </template>

          <template #action>
            <AppButton
              kind="setting-action"
              @click="showPurgeCacheModal"
            >
              <v-icon
                class="font-weight-bold"
                icon="$restore"
                size="16"
              />

              <span class="font-weight-bold">{{ t('button.purge') }}</span>
            </AppButton>
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cloudflare.development.subtitle')"
          :loading="isLoading"
          :title="t('heading.instance.advanced.cloudflare.development.title')"
          title-tag="h5"
        >
          <template #alert>
            <AlertSm
              class="alert-sm--primary"
              :text="t('heading.instance.advanced.cloudflare.development.alert')"
            />
          </template>

          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.cloudflare.development.title')"
              class="mt-0"
              :loading="submittingDevelopmentMode"
              :model-value="developmentMode"
              @click="onDevelopmentModeToggle"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cloudflare.browser.subtitle')"
          :loading="isLoading"
          :title="t('heading.instance.advanced.cloudflare.browser.title')"
          title-tag="h5"
        >
          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.cloudflare.browser.title')"
              class="mt-0"
              :loading="submittingBrowserCheck"
              :model-value="browserCheck"
              @click="onBrowserCheckToggle"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cloudflare.security.subtitle')"
          :loading="isLoading"
          :title="t('heading.instance.advanced.cloudflare.security.title')"
          title-tag="h5"
        >
          <template #footer>
            <v-select
              v-model="securityLevel"
              :aria-label="t('heading.instance.advanced.cloudflare.security.title')"
              hide-details
              :items="securityLevelItems"
              :menu-props="{ offset: 4, contentClass: 'cloudflare-security-menu' }"
              variant="outlined"
              @update:model-value="onSecurityLevelChange"
            />
          </template>
        </SettingCard>
      </v-col>
    </AdvancedPageLayout>

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="purgeSubmitting"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <BasicModal
        :buttons="purgeButtons"
        class="card-width-560"
        icon="$restore"
        :message="t('heading.instance.advanced.cloudflare.modal.purge.info')"
        :submitting="purgeSubmitting"
        :title="t('heading.instance.advanced.cloudflare.modal.purge.title')"
        @button-click="onModalButton"
        @modal-close="modalOpen = false"
      />
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  // The title, the five cards (DNS status, purge cache, development mode, browser
  // check, security level) and the purge modal. The scoped SCSS has no target here.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import NameserverListItem from '@/views/projects/project/advanced/cloudflare/NameserverListItem.vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { cloudflareNsDetected } from '@/entities/domain/verify-domain-resolving'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { CLOUDFLARE_SECURITY_LEVELS, isCloudflareLoading, isCloudflareOn } from './cloudflare-settings'
  import {
    getBrowserCheck,
    getDevelopmentMode,
    getSecurityLevel,
    purgeCache,
    updateBrowserCheck,
    updateDevelopmentMode,
    updateSecurityLevel,
  } from './cloudflare.api'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const alerts = useAlertsStore()

  const cloudflareActivated = ref(false)

  const fetchingDevelopmentMode = ref(false)
  const fetchingBrowserCheck = ref(false)
  const fetchingSecurityLevel = ref(false)

  const developmentMode = ref(false)
  const submittingDevelopmentMode = ref(false)
  const browserCheck = ref(false)
  const submittingBrowserCheck = ref(false)

  const securityLevel = ref('')

  const modalOpen = ref(false)
  const purgeSubmitting = ref(false)
  const purgeButtons = computed(() => [
    { id: 'submit', label: t('button.purgeEverything'), color: 'primary' },
    cancelButton(t),
  ])

  useBodyScrollLock(modalOpen)

  // The labels are translated here, the order is the legacy order.
  const securityLevelItems = computed(() => CLOUDFLARE_SECURITY_LEVELS.map(level => ({
    title: t(level.labelKey),
    value: level.value,
  })))

  const isLoading = computed(() => isCloudflareLoading(
    fetchingDevelopmentMode.value,
    fetchingBrowserCheck.value,
    fetchingSecurityLevel.value,
  ))

  /**
   * The status badge. The helper does not throw, and a domain without Cloudflare keeps the "Wrong DNS" badge.
   * Without a domain there is nothing to resolve (legacy queried `name=undefined`), so the badge stays "Wrong DNS" without a request.
   */
  async function fetchStatus (): Promise<void> {
    if (!props.instance.domain) {
      return
    }
    if (await cloudflareNsDetected(props.instance.domain)) {
      cloudflareActivated.value = true
    }
  }

  /**
   * The page-to-page hand-off is the history state: a
   * structured clone cannot carry the `InstanceResource` methods, so only the service id goes (`HostingView.vue` reads it).
   */
  function openDnsRecords (): void {
    void router.push({
      path: '/hosting/dns',
      state: { instance: { service_id: (props.instance.service_id as number | string | null | undefined) ?? null } },
    })
  }

  /** The switch position. A failure alerts and leaves the switch off. */
  async function fetchBrowserCheckState (): Promise<void> {
    fetchingBrowserCheck.value = true
    try {
      browserCheck.value = isCloudflareOn(await getBrowserCheck(props.instance.id))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingBrowserCheck.value = false
    }
  }

  /** The switch position. A failure alerts and leaves the switch off. */
  async function fetchDevelopmentModeState (): Promise<void> {
    fetchingDevelopmentMode.value = true
    try {
      developmentMode.value = isCloudflareOn(await getDevelopmentMode(props.instance.id))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingDevelopmentMode.value = false
    }
  }

  /**
   * The PATCH carries the reversed value, and the switch flips only after the server accepts it.
   * Deviation: a click while the save is in flight is ignored (legacy let it through).
   */
  async function onDevelopmentModeToggle (): Promise<void> {
    if (submittingDevelopmentMode.value) {
      return
    }
    submittingDevelopmentMode.value = true
    try {
      await updateDevelopmentMode(props.instance.id, !developmentMode.value)
      developmentMode.value = !developmentMode.value
      alerts.addAlert({ success: true, successMessage: t('notification.instance.cloudflare.development.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submittingDevelopmentMode.value = false
    }
  }

  /**
   * The PATCH carries the reversed value, and the switch flips only after the server accepts it.
   * Deviation: a click while the save is in flight is ignored (legacy let it through).
   */
  async function onBrowserCheckToggle (): Promise<void> {
    if (submittingBrowserCheck.value) {
      return
    }
    submittingBrowserCheck.value = true
    try {
      await updateBrowserCheck(props.instance.id, !browserCheck.value)
      browserCheck.value = !browserCheck.value
      alerts.addAlert({ success: true, successMessage: t('notification.instance.cloudflare.browser.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submittingBrowserCheck.value = false
    }
  }

  /** The select position. A failure alerts and leaves the select empty. */
  async function fetchSecurityLevelState (): Promise<void> {
    fetchingSecurityLevel.value = true
    try {
      securityLevel.value = await getSecurityLevel(props.instance.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingSecurityLevel.value = false
    }
  }

  /**
   * The select PATCHes on every change (`@change`). Like legacy, there is no rollback, so a
   * failed save keeps the new value on the select and only shows the error alert.
   */
  async function onSecurityLevelChange (value: string): Promise<void> {
    securityLevel.value = value
    try {
      await updateSecurityLevel(props.instance.id, value)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.cloudflare.securityLevel.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  /** Opens the confirmation. */
  function showPurgeCacheModal (): void {
    modalOpen.value = true
  }

  /** The POST, then the success or error alert. `finally` closes the modal in both cases, as legacy does. */
  async function purgeEverything (): Promise<void> {
    purgeSubmitting.value = true
    try {
      await purgeCache(props.instance.id)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.cloudflare.cache.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      purgeSubmitting.value = false
    }
  }

  function onModalButton (id: string): void {
    if (id === 'submit') {
      void purgeEverything()
      return
    }
    modalOpen.value = false
  }

  onMounted(() => {
    // Legacy order: status, security level, browser check, development mode. All requests run in parallel.
    void fetchStatus()
    void fetchSecurityLevelState()
    void fetchBrowserCheckState()
    void fetchDevelopmentModeState()
  })
</script>

<style lang="scss" scoped>
// The status column (`min-width: 120px`). The Active / Wrong DNS badge is the
// kit `StatusLabel`.
.cloudflare-status {
  min-width: 120px;
}

</style>
