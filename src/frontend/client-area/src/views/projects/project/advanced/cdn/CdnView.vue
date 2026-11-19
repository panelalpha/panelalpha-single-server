<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.cdn.title')">
      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.cdn.purge.subtitle')"
          :loading="fetchingStatus"
          :title="t('heading.instance.advanced.cdn.purge.title')"
        >
          <template #alert>
            <AlertSm
              class="alert-sm--primary"
              :text="t('heading.instance.advanced.cdn.purge.alert')"
            />
          </template>

          <template #action>
            <AppButton
              :disabled="!cdnEnabled"
              kind="setting-action"
              :loading="purgeSubmitting"
              @click="showPurgeModal"
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
          :description="t('heading.instance.advanced.cdn.under-attack.subtitle')"
          :loading="fetchingStatus"
          :title="t('heading.instance.advanced.cdn.under-attack.title')"
        >
          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.cdn.under-attack.title')"
              class="mt-0"
              :disabled="!cdnEnabled"
              :loading="submittingUnderAttack"
              :model-value="underAttackMode"
              @click="onUnderAttackToggle"
            />
          </template>
        </SettingCard>
      </v-col>

      <v-col
        v-if="cdnEnabled"
        class="pb-2"
        cols="12"
      >
        <v-card elevation="4">
          <v-card-text class="pb-6 text-gray-darken-2">
            <h6>{{ t('heading.instance.advanced.cdn.features.title') }}</h6>

            <v-list
              class="cdn-features"
              density="compact"
            >
              <v-list-item
                v-for="feature in features"
                :key="feature.name"
              >
                <template #prepend>
                  <v-icon
                    class="me-3"
                    color="success"
                    icon="$check"
                    size="18"
                  />
                </template>

                <v-list-item-title class="text-gray-darken-2">
                  {{ cdnFeatureLabel(feature) }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
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
        :message="t('heading.instance.advanced.cdn.modal.purge.info')"
        :submitting="purgeSubmitting"
        :title="t('heading.instance.advanced.cdn.modal.purge.title')"
        @button-click="onModalButton"
        @modal-close="modalOpen = false"
      />
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { CdnFeature } from './cdn.api'
  // Title, purge card, under-attack card, plus the status
  // request, the loading skeleton, the features card, the plan watcher and the
  // purge modal with its request.
  // The scoped SCSS of the legacy page is absent, so nothing is ported here.
  // The purge icon and label drop the legacy `text--gray`: app-lite defines only `text--gray-darken1/-lighten1/-darken2`,
  // so the class does nothing there; V4 `text-gray` would paint the button `#CBCBDC`. The colour is inherited from `v-btn--default`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import { cdnFeatureLabel, isCdnEnabled } from './cdn-settings'
  import { getCdnStatus, purgeCdnCache, setUnderAttackMode } from './cdn.api'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // A plan without a CDN keeps both cards visible but disabled, and sends no request.
  const cdnEnabled = computed(() => isCdnEnabled(props.instance))

  const fetchingStatus = ref(false)
  const underAttackMode = ref(false)
  const submittingUnderAttack = ref(false)
  const features = ref<CdnFeature[]>([])

  const modalOpen = ref(false)
  const purgeSubmitting = ref(false)
  const purgeButtons = computed(() => [
    { id: 'submit', label: t('button.purge'), color: 'primary' },
    cancelButton(t),
  ])

  // No `useBodyScrollLock`: legacy uses a plain `v-dialog` and never dispatches `lockBodyScroll`; `html.scrollLock` moved the page 8px. The mobile lock is the `scroll-lock` of `AppDialog`.

  // Each status request takes a number. A response to an older request, or one that arrives after the plan lost its CDN, is dropped.
  let statusRequest = 0

  // A failed request clears the state and shows no alert.
  async function fetchStatus () {
    const request = ++statusRequest
    fetchingStatus.value = true
    try {
      const status = await getCdnStatus(props.instance.id)
      if (request === statusRequest) {
        underAttackMode.value = status.under_attack_mode
        features.value = status.features
      }
    } catch {
      if (request === statusRequest) {
        underAttackMode.value = false
        features.value = []
      }
    } finally {
      if (request === statusRequest) {
        fetchingStatus.value = false
      }
    }
  }

  /**
   * The POST carries the reversed value, and the switch flips only after the server accepts it.
   * Deviation: a click while the save is in flight is ignored (legacy let it through).
   * Deviation: a click while the CDN is disabled is ignored (`ButtonSwitch` lets the click fall through to the root, legacy sent the POST and got a 400).
   */
  async function onUnderAttackToggle (): Promise<void> {
    if (!cdnEnabled.value || submittingUnderAttack.value) {
      return
    }
    submittingUnderAttack.value = true
    const newValue = !underAttackMode.value
    try {
      await setUnderAttackMode(props.instance.id, newValue)
      if (cdnEnabled.value) {
        underAttackMode.value = newValue
      }
      alerts.addAlert({
        success: true,
        successMessage: newValue
          ? t('notification.instance.cdn.under-attack.enable.success')
          : t('notification.instance.cdn.under-attack.disable.success'),
      })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submittingUnderAttack.value = false
    }
  }

  /** Opens the confirmation. */
  function showPurgeModal (): void {
    modalOpen.value = true
  }

  /**
   * The POST without a body, then the success or error alert. `finally` closes the modal and clears
   * the loading of both the modal and the card button, in both cases, as legacy does.
   */
  async function purgeCache (): Promise<void> {
    if (purgeSubmitting.value) {
      return
    }
    purgeSubmitting.value = true
    try {
      await purgeCdnCache(props.instance.id)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.cdn.purge.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      purgeSubmitting.value = false
    }
  }

  function onModalButton (id: string): void {
    if (id === 'submit') {
      void purgeCache()
      return
    }
    modalOpen.value = false
  }

  onMounted(() => {
    if (cdnEnabled.value) {
      fetchStatus()
    }
  })

  // A plan that gains a CDN fetches the status, a plan that loses it clears the state.
  watch(cdnEnabled, (newValue, oldValue) => {
    if (newValue === true && oldValue === false) {
      fetchStatus()
    }
    if (newValue === false) {
      statusRequest += 1
      fetchingStatus.value = false
      underAttackMode.value = false
      features.value = []
    }
  })
</script>

<style lang="scss" scoped>
// Legacy `v-list dense` items take no vertical padding; V4 `density="compact"` adds 4 px above and below each row (measured).
// The list keeps its density, the items drop the padding.
.cdn-features :deep(.v-list-item) {
  padding-top: 0;
  padding-bottom: 0;
}

// V2 `.theme--dark.v-list` is the sheet colour (`#1e1e1e` in dark, white in light); V4 `.v-list` takes the card surface (`47, 47, 61` in dark).
.cdn-features {
  background-color: var(--v-sheet-surface);
}
</style>
