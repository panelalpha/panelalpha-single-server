<template>
  <v-dialog
    ref="dialog"
    :model-value="opened"
    :persistent="submitting"
    transition="custom-dialog-transition"
    @update:model-value="onDialogUpdate"
  >
    <div
      class="card-overlay"
      @click="close"
    />

    <v-card
      class="basic-modal card-width-560"
      data-testid="ssl-edit-modal"
      elevation="4"
    >
      <v-card-title class="d-flex justify-space-between">
        <h6 class="heading--text d-flex align-center">
          <v-icon
            class="ssl-lock-icon mr-4"
            color="primary"
            icon="$lockoutline"
            size="24"
          />

          <span>{{ t('heading.instance.editSsl.modal.title') }}</span>
        </h6>

        <modal-close-button
          v-if="!submitting"
          @click="close"
        />
      </v-card-title>

      <v-card-text>
        <template v-if="confirmingRemove">
          <p
            class="mb-4 p-2 p-3"
            data-testid="ssl-remove-confirm-text"
          >
            {{ t('heading.instance.editSsl.modal.remove.confirm') }}
          </p>

          <AppMessage
            v-if="removeError"
            data-testid="ssl-remove-error"
            variant="error"
          >
            <span>{{ removeError }}</span>
          </AppMessage>
        </template>

        <template v-else>
          <p class="mb-4 p-2 p-3">
            {{ t('general.domain') }}:
            <strong>{{ domain }}</strong>
          </p>

          <div
            v-if="installedCert || detectedCert"
            class="mb-4"
          >
            <div
              v-if="installedCert"
              class="d-flex align-center"
            >
              {{ t('heading.instance.changeSslModal.serverCertificate') }}:
              <ssl-indicator
                class="ms-4 me-1 d-inline-block"
                :fetching="false"
                :is-icon="false"
                :ssl="installedIndicatorSsl(installedCert)"
              />
            </div>

            <div
              v-if="detectedCert"
              class="d-flex align-center"
            >
              {{ t('heading.instance.changeSslModal.detectedCertificate') }}:
              <ssl-indicator
                class="mx-4 d-inline-block"
                :fetching="false"
                :is-icon="false"
                :ssl="indicatorSsl(detectedCert)"
              />
            </div>
          </div>

          <div
            v-if="showPending"
            class="mb-4"
          >
            <pending-ssl-indicator :domain="{ domain, ssl_order_status: orderStatus }" />
          </div>

          <template v-if="!isWpCloud">
            <v-form ref="form">
              <label class="base--text mb-2">
                {{ t('heading.instance.editSsl.modal.provider') }}
              </label>

              <v-select
                v-model="values.provider"
                class="v-input--md"
                data-testid="ssl-edit-provider"
                density="compact"
                :disabled="isOrderBlocking || submitting"
                hide-details="auto"
                item-title="label"
                item-value="value"
                :items="providerItems"
                menu-icon="$dropdown"
                variant="outlined"
              />

              <template v-if="isCustom">
                <label class="base--text mb-2 mt-4">{{ t('form.label.certificate') }}</label>

                <v-textarea
                  v-model="values.certificate"
                  class="v-input--md mb-2"
                  density="compact"
                  :disabled="isOrderBlocking || submitting"
                  hide-details="auto"
                  :placeholder="t('form.placeholder.certificate')"
                  :rules="[required(t('form.label.certificate'))]"
                  variant="outlined"
                />

                <label class="base--text mb-2 mt-4">{{ t('form.label.privateKeyWithShortcut') }}</label>

                <v-textarea
                  v-model="values.key"
                  class="v-input--md mb-2"
                  density="compact"
                  :disabled="isOrderBlocking || submitting"
                  hide-details="auto"
                  :placeholder="t('form.placeholder.certificateKey')"
                  :rules="[required(t('form.label.privateKeyWithShortcut'))]"
                  variant="outlined"
                />

                <label class="base--text mb-2 mt-4">{{ t('form.label.cabundle') }}</label>

                <v-textarea
                  v-model="values.cabundle"
                  class="v-input--md"
                  density="compact"
                  :disabled="isOrderBlocking || submitting"
                  hide-details="auto"
                  :placeholder="t('form.placeholder.cabundle')"
                  variant="outlined"
                />
              </template>
            </v-form>

            <a
              v-if="orderLink && !isCustom"
              class="text-info d-inline-block mt-4"
              data-testid="ssl-edit-order-link"
              :href="orderLink"
              rel="noopener"
              target="_blank"
            >
              {{ t('heading.instance.editSsl.modal.orderLink') }}
            </a>
          </template>
        </template>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap pb-4 pt-4">
        <template v-if="confirmingRemove">
          <div class="w-100 pb-2">
            <AppButton
              block
              data-testid="ssl-remove-confirm"
              kind="danger"
              :loading="submitting"
              size="large"
              @click="onRemove"
            >
              <template #loader>
                <loader color="white" no-margins :size="20" />
              </template>

              <span class="p-2 font-weight-600">{{ t('button.remove') }}</span>
            </AppButton>
          </div>

          <div class="w-100 pb-2 cancel-btn">
            <AppButton
              block
              class="normal"
              :disabled="submitting"
              kind="text"
              size="large"
              @click="cancelRemove"
            >
              <span class="p-2 font-weight-bold text--gray-darken1">
                {{ t('button.cancel') }}
              </span>
            </AppButton>
          </div>
        </template>

        <template v-else>
          <div class="w-100 pb-2">
            <AppButton
              block
              data-testid="ssl-edit-submit"
              :disabled="isOrderBlocking"
              kind="primary"
              :loading="submitting"
              size="large"
              @click="onSubmit"
            >
              <template #loader>
                <loader color="white" no-margins :size="20" />
              </template>

              <span class="p-2 font-weight-600">{{ primaryLabel }}</span>
            </AppButton>
          </div>

          <div
            v-if="installedCert"
            class="w-100 pb-2"
          >
            <AppButton
              block
              data-testid="ssl-edit-remove"
              :disabled="submitting"
              kind="text"
              size="large"
              @click="startRemove"
            >
              <span class="p-2 font-weight-bold text--gray-darken1">{{ t('heading.instance.editSsl.modal.remove.title') }}</span>
            </AppButton>
          </div>

          <div class="w-100 pb-2 cancel-btn">
            <AppButton
              block
              class="normal"
              :disabled="submitting"
              kind="text"
              size="large"
              @click="close"
            >
              <span class="p-2 font-weight-bold text--gray-darken1">
                {{ t('button.cancel') }}
              </span>
            </AppButton>
          </div>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { SslOrderStatus } from './ssl-status'
  // The screen opens it through `open()` and listens for the two events.
  import type { SslCertificate, SslOffer } from '@/entities/ssl/ssl-certificates.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, reactive, ref, useTemplateRef } from 'vue'
  import {
    getDetectedCertificate,
    getInstalledCertificate,
    installCertificate,
    listSslOffers,
    orderCertificate,
    removeCertificate,
    resetCertificateCache,
    retryCertificate,
  } from '@/entities/ssl/ssl-certificates.api'
  import { isSslOrderBlocking, shouldShowSslOrderStatus } from '@/entities/ssl/ssl-order-status'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import PendingSslIndicator from './PendingSslIndicator.vue'
  import {
    CUSTOM_PROVIDER,
    defaultProvider,
    indicatorSsl,
    installedIndicatorSsl,
    primaryLabelKey,
    providerOptions,
    type SslEditPayload,
    sslSubmitAction,
  } from './ssl-edit-modal'
  import SslIndicator from './SslIndicator.vue'

  defineProps<{
    // `store.state.home.app.order_custom_ssl_certificate_link`: where a custom certificate can be bought.
    orderLink?: string
  }>()

  const emit = defineEmits<{
    'ssl-certificate-installed': [item: unknown]
    'ssl-certificate-ordered': [item: unknown]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const form = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('form')

  const opened = ref(false)
  useMobileScrollLock(opened)
  const submitting = ref(false)
  const isWpCloud = ref(false)
  const domain = ref('')
  const serverAccountId = ref(0)
  const orderStatus = ref<SslOrderStatus>('none')
  // The row (or application) the screen passed; handed back by the events.
  let sourceItem: unknown = null
  const installedCert = ref<SslCertificate | null>(null)
  const detectedCert = ref<SslCertificate | null>(null)
  // Removing the certificate is a second step: the card asks before the Engine drops it.
  const confirmingRemove = ref(false)
  const removeError = ref('')
  const offers = ref<SslOffer[]>([])
  const values = reactive<Record<string, unknown>>({ provider: CUSTOM_PROVIDER, certificate: '', key: '', cabundle: '' })

  useBodyScrollLock(opened)

  const isCustom = computed(() => values.provider === CUSTOM_PROVIDER)
  const isOrderBlocking = computed(() => isSslOrderBlocking(orderStatus.value))
  const showPending = computed(() => shouldShowSslOrderStatus(orderStatus.value, { certificate: detectedCert.value }))

  const required = (label: string) => (value: unknown) => !!value || t('form.validation.required', { field: label })

  const providerItems = computed(() => providerOptions(offers.value, t('form.option.ssl.custom')))
  const primaryLabel = computed(() => t(primaryLabelKey({ isWpCloud: isWpCloud.value, isCustom: isCustom.value })))

  function alertError (error: unknown): void {
    alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
  }

  function resetForm (): void {
    submitting.value = false
    offers.value = []
    values.provider = CUSTOM_PROVIDER
    values.certificate = ''
    values.key = ''
    values.cabundle = ''
    installedCert.value = null
    detectedCert.value = null
    confirmingRemove.value = false
    removeError.value = ''
    sourceItem = null
    isWpCloud.value = false
    orderStatus.value = 'none'
  }

  function loadData (payload: SslEditPayload): Promise<unknown> {
    const fetches: Array<Promise<unknown>> = []
    if (!isWpCloud.value) {
      fetches.push(listSslOffers().then(result => {
        offers.value = result
        values.provider = defaultProvider(result)
      }).catch((error: unknown) => {
        offers.value = []
        values.provider = CUSTOM_PROVIDER
        alertError(error)
      }))
    }
    if (payload.sslInstalledCert === undefined) {
      fetches.push(getInstalledCertificate(serverAccountId.value, domain.value).then(certificate => {
        installedCert.value = certificate
      }).catch(alertError))
    }
    if (payload.sslDetectedCert === undefined) {
      fetches.push(getDetectedCertificate(serverAccountId.value, domain.value).then(certificate => {
        detectedCert.value = certificate
      }).catch(alertError))
    }
    return Promise.all(fetches)
  }

  /** `open(payload)`: resets the form, loads the offers and the missing certificates, then shows the dialog. */
  async function open (payload: SslEditPayload): Promise<void> {
    resetForm()
    domain.value = payload.domain
    serverAccountId.value = payload.serverAccountId
    orderStatus.value = payload.sslOrderStatus || 'none'
    isWpCloud.value = Boolean(payload.isWpCloud)
    sourceItem = payload.sourceItem
    if (payload.sslInstalledCert !== undefined) {
      installedCert.value = payload.sslInstalledCert || null
    }
    if (payload.sslDetectedCert !== undefined) {
      detectedCert.value = payload.sslDetectedCert || null
    }
    await loadData(payload)
    opened.value = true
  }

  function close (): void {
    if (!submitting.value) {
      opened.value = false
    }
  }

  function onDialogUpdate (value: boolean): void {
    if (!value) {
      close()
    }
  }

  async function run (request: () => Promise<void>, successKey: string, event: 'ssl-certificate-installed' | 'ssl-certificate-ordered'): Promise<void> {
    submitting.value = true
    try {
      await request()
      alerts.addAlert({ success: true, successMessage: t(successKey) })
      if (event === 'ssl-certificate-installed') {
        emit('ssl-certificate-installed', sourceItem)
      } else {
        emit('ssl-certificate-ordered', sourceItem)
      }
      opened.value = false
    } catch (error) {
      alertError(error)
    } finally {
      submitting.value = false
    }
  }

  function startRemove (): void {
    if (submitting.value) {
      return
    }
    removeError.value = ''
    confirmingRemove.value = true
  }

  function cancelRemove (): void {
    confirmingRemove.value = false
    removeError.value = ''
  }

  /**
   * The DELETE answers the certificate the domain carries now, so the dialog
   * shows it without asking the panel's 30 s certificate checks again.
   */
  async function onRemove (): Promise<void> {
    submitting.value = true
    removeError.value = ''
    const account = serverAccountId.value
    try {
      const certificate = await removeCertificate(account, domain.value)
      resetCertificateCache(account)
      installedCert.value = certificate
      detectedCert.value = certificate
      confirmingRemove.value = false
      alerts.addAlert({ success: true, successMessage: t('notification.instance.editSsl.remove.success') })
      emit('ssl-certificate-installed', sourceItem)
    } catch (error) {
      removeError.value = getErrorMessage(error)
    } finally {
      submitting.value = false
    }
  }

  async function onSubmit (): Promise<void> {
    const action = sslSubmitAction({ status: orderStatus.value, isWpCloud: isWpCloud.value, isCustom: isCustom.value })
    if (action === 'blocked') {
      return
    }
    const account = serverAccountId.value
    const name = domain.value
    switch (action) {
      case 'retry': {
        await run(() => retryCertificate(account, name), 'notification.instance.editSsl.order.success', 'ssl-certificate-ordered')
        break
      }
      case 'install': {
        if (form.value && !(await form.value.validate()).valid) {
          return
        }
        await run(
          () => installCertificate(account, {
            domain: name,
            certificate: String(values.certificate),
            key: String(values.key),
            cabundle: String(values.cabundle),
          }),
          'notification.instance.editSsl.edit.success',
          'ssl-certificate-installed',
        )
        break
      }
      default: {
        await run(() => orderCertificate(account, name, values.provider as number | string), 'notification.instance.editSsl.order.success', 'ssl-certificate-ordered')
      }
    }
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// The frame rules of `BasicModal.scss` for a dialog that is not a `BasicModal` (app-lite's `SslEditModal` has its own card).
.v-card {
  // V4 `.v-card-actions` spaces its children with `gap: 0.5rem`, V2 had none.
  :deep(.v-card-actions) {
    gap: 0;
    padding-top: 16px;
    border-bottom-left-radius: inherit;
    border-bottom-right-radius: inherit;
  }

  :deep(.v-card-title) {
    // V2 vendor `.v-card__title { flex-wrap: wrap }`: on mobile the X drops under a long title.
    flex-wrap: wrap;
    align-items: center;
    // V2 `.v-card__title` breaks anywhere; V4 only at word boundaries.
    word-break: break-all;

    .v-btn {
      align-self: flex-start;
    }
  }
}

b {
  font-weight: v.$font-weight-semibold;
}

// The global `.v-icon` colour beats the `color="primary"` prop.
.v-icon.ssl-lock-icon {
  color: rgb(var(--v-theme-primary));
}

.v-input {
  :deep(.v-input__details) {
    // Legacy 2px on top of the V2 slot's 8px margin; V4 details add 6px padding-top (see `_inputs.scss`), so 2 - 6.
    margin-top: -4px;
    margin-bottom: 0;
  }
}

// Lite's provider select draws the dropdown arrow in the primary colour; V4 keeps it in the text colour.
.v-select {
  :deep(.v-field__append-inner .v-icon) {
    color: rgb(var(--v-theme-primary));
  }
}

// The V2 `label` is inline, so the `mt-4` / `mb-2` of the labels never moved anything (only the `mb-2` of the textareas does).
label {
  display: inline;
}

// V2 `height="112px"` sized the textarea's input slot; V4 has no `height` prop, so the field gets that height.
.v-textarea.v-textarea :deep(.v-input__control .v-field) {
  min-height: 112px;
  height: 112px;

  // The V2 textarea sat 10px below the top of its slot, on 28px lines (102px of the 112px).
  .v-field__input {
    margin-top: 10px;
    min-height: 102px;
    height: 102px;
    line-height: 28px;
  }
}
</style>
