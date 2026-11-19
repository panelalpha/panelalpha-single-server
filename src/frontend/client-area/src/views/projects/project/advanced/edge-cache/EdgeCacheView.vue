<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.edge-cache.title')">
      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.edge-cache.manage.subtitle')"
          :loading="fetchingEdgeCache"
          :title="t('heading.instance.advanced.edge-cache.manage.title')"
        >
          <template
            v-if="cloudflareNoteShown"
            #alert
          >
            <AppMessage
              icon="$alertcircle"
              variant="warning"
            >
              <span>{{ t('heading.instance.advanced.edge-cache.cloudflare-conflict.note') }}</span>
            </AppMessage>
          </template>

          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.edge-cache.manage.title')"
              class="mt-0"
              :loading="submittingEdgeCache"
              :model-value="edgeCacheStatus"
              @click="onEdgeCacheClick"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.edge-cache.purge.subtitle')"
          :title="t('heading.instance.advanced.edge-cache.purge.title')"
        >
          <template #alert>
            <AlertSm
              class="alert-sm--primary"
              :text="t('heading.instance.advanced.edge-cache.purge.alert')"
            />
          </template>

          <template #action>
            <AppButton
              kind="setting-action"
              @click="showPurgeEdgeCacheModal"
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
          :description="t('heading.instance.advanced.edge-cache.defensive-mode.subtitle')"
          :loading="fetchingEdgeCache"
          :title="t('heading.instance.advanced.edge-cache.defensive-mode.title')"
        >
          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.edge-cache.defensive-mode.title')"
              class="mt-0"
              :loading="submittingDefensiveMode"
              :model-value="defensiveModeStatus"
              @click="onDefensiveModeClick"
            />
          </template>

          <template
            v-if="!defensiveModeStatus"
            #footer
          >
            <v-select
              v-model="defensiveModeTtl"
              :aria-label="t('form.label.ttl')"
              hide-details
              :items="defensiveModeItems"
              :menu-props="{ offset: 4, contentClass: 'edge-cache-ttl-menu' }"
              variant="outlined"
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
        :alert="modal.alert"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :icon="modal.icon"
        :message="modal.message"
        :submitting="purgeSubmitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalOpen = false"
      />
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // The title, the edge cache switch with the Cloudflare conflict note, its PUT, the Cloudflare confirmation modal, the purge card with its modal, and the defensive
  // mode card with its TTL select.
  // Deviations: the card text uses the V4 class `text-gray-darken-2` (as CloudflareView, not the legacy `text--gray-darken2`); a click
  // while the switch is saving is ignored, and so is a second purge submit; the dead scoped `.v-card--mobile` rule has
  // no target and is left out; the TTL select holds seconds (default 1800), and its labels are computed with `t()`, so they follow the
  // language; the purge button drops the legacy `text--gray`: legacy defines no such class, and V4 `text-gray` would paint
  // the icon and label `#CBCBDC`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import { DEFAULT_EDGE_CACHE_TTL, EDGE_CACHE_TTL_OPTIONS, shouldWarnCloudflare } from './edge-cache-settings'
  import { getEdgeCache, purgeEdgeCache, updateDefensiveMode, updateEdgeCache } from './edge-cache.api'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const fetchingEdgeCache = ref(false)
  const edgeCacheStatus = ref(false)
  const submittingEdgeCache = ref(false)
  const defensiveModeStatus = ref(false)

  // The field `instance.service_has_dns_cloudflare` is typed `unknown` in the resource, so it is coerced here.
  const hasCloudflareDns = computed(() => !!props.instance.service_has_dns_cloudflare)

  // The Cloudflare note sits in the Manage card while the cache is on and the domain has Cloudflare DNS.
  const cloudflareNoteShown = computed(() => edgeCacheStatus.value && hasCloudflareDns.value)

  // One dialog serves every modal. `modalKind` only changes on open and is never reset, so the content stays during the close animation.
  type EdgeCacheModalKind = 'cloudflare-warning' | 'purge'
  interface EdgeCacheModalView {
    icon: string
    color?: string
    title: string
    message: string
    alert?: string
    buttons: ModalButton[]
  }
  const modalOpen = ref(false)
  const modalKind = ref<EdgeCacheModalKind>('cloudflare-warning')
  const purgeSubmitting = ref(false)

  const submittingDefensiveMode = ref(false)
  // The select holds seconds. Legacy held the whole `{ label, value }` object.
  const defensiveModeTtl = ref(DEFAULT_EDGE_CACHE_TTL)

  // The labels are translated here with the count, in legacy order.
  const defensiveModeItems = computed(() => EDGE_CACHE_TTL_OPTIONS.map(option => ({
    title: t(option.labelKey, { count: option.count }),
    value: option.value,
  })))

  // The Cloudflare warning, with "Enable Anyway" in front of Cancel.
  // The purge confirmation, with "Purge" in front of Cancel and no alert.
  const modalContent: Record<EdgeCacheModalKind, () => EdgeCacheModalView> = {
    'cloudflare-warning': () => ({
      icon: '$alertwarning',
      color: 'warning',
      title: t('heading.instance.advanced.edge-cache.modal.cloudflare-warning.title'),
      message: t('heading.instance.advanced.edge-cache.modal.cloudflare-warning.info'),
      alert: t('heading.instance.advanced.edge-cache.modal.cloudflare-warning.alert'),
      buttons: [
        { id: 'enable', label: t('button.edge-cache.enable'), color: 'primary' },
        cancelButton(t),
      ],
    }),
    'purge': () => ({
      icon: '$restore',
      title: t('heading.instance.advanced.edge-cache.modal.purge.title'),
      message: t('heading.instance.advanced.edge-cache.modal.purge.info'),
      buttons: [
        { id: 'purge', label: t('button.purge'), color: 'primary' },
        cancelButton(t),
      ],
    }),
  }
  const modal = computed(() => modalContent[modalKind.value]())

  /** Both switch positions. A failure alerts and leaves both switches off. */
  async function fetchEdgeCacheStatus (): Promise<void> {
    fetchingEdgeCache.value = true
    try {
      const status = await getEdgeCache(props.instance.id)
      edgeCacheStatus.value = status.isActive
      defensiveModeStatus.value = status.isDefensiveMode
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingEdgeCache.value = false
    }
  }

  /** Template handler: a plain click, with no arguments forwarded to `toggleEdgeCache`. */
  function onEdgeCacheClick (): void {
    void toggleEdgeCache()
  }

  /** Opens the purge confirmation. */
  function showPurgeEdgeCacheModal (): void {
    modalKind.value = 'purge'
    modalOpen.value = true
  }

  /**
   * The PUT, then the success or error alert. The dialog stays persistent while the request runs.
   * `finally` closes the modal in both cases, as legacy does, so the `submittingError` of the legacy modal is never shown.
   * A second submit while the purge is in flight is ignored.
   */
  async function submitPurge (): Promise<void> {
    if (purgeSubmitting.value) {
      return
    }
    purgeSubmitting.value = true
    try {
      await purgeEdgeCache(props.instance.id)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.edge-cache.purge.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      purgeSubmitting.value = false
    }
  }

  /**
   * Modal buttons. "Enable Anyway" closes the modal first, then sends the PUT
   * as confirmed. "Purge" keeps the modal open until the request ends. Cancel only closes.
   */
  function onModalButton (id: string): void {
    if (id === 'purge') {
      void submitPurge()
      return
    }
    modalOpen.value = false
    if (id === 'enable') {
      void toggleEdgeCache(true)
    }
  }

  /**
   * The switch flips only after the server accepts the PUT. A click while the save is in flight
   * is ignored, before the modal decision. Turning on for Cloudflare DNS opens the warning instead of sending the PUT.
   */
  async function toggleEdgeCache (confirmed = false): Promise<void> {
    if (submittingEdgeCache.value) {
      return
    }
    if (shouldWarnCloudflare(edgeCacheStatus.value, confirmed, hasCloudflareDns.value)) {
      modalKind.value = 'cloudflare-warning'
      modalOpen.value = true
      return
    }
    submittingEdgeCache.value = true
    try {
      await updateEdgeCache(props.instance.id, !edgeCacheStatus.value)
      edgeCacheStatus.value = !edgeCacheStatus.value
      alerts.addAlert({
        success: true,
        successMessage: edgeCacheStatus.value
          ? t('notification.instance.edge-cache.manage.enable.success')
          : t('notification.instance.edge-cache.manage.disable.success'),
      })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submittingEdgeCache.value = false
    }
  }

  /** Template handler: a plain click, with no arguments forwarded to `toggleDefensiveMode`. */
  function onDefensiveModeClick (): void {
    void toggleDefensiveMode()
  }

  /**
   * The PUT carries the reversed status and the selected `ttl` (also when turning
   * off). The switch flips only after the server accepts it. A click while the save is in flight is ignored. Changing the select sends
   * nothing.
   */
  async function toggleDefensiveMode (): Promise<void> {
    if (submittingDefensiveMode.value) {
      return
    }
    submittingDefensiveMode.value = true
    try {
      await updateDefensiveMode(props.instance.id, !defensiveModeStatus.value, defensiveModeTtl.value)
      defensiveModeStatus.value = !defensiveModeStatus.value
      alerts.addAlert({
        success: true,
        successMessage: defensiveModeStatus.value
          ? t('notification.instance.edge-cache.defensive-mode.enable.success')
          : t('notification.instance.edge-cache.defensive-mode.disable.success'),
      })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submittingDefensiveMode.value = false
    }
  }

  onMounted(() => {
    void fetchEdgeCacheStatus()
  })
</script>
