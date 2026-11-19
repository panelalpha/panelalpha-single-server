<template>
  <v-dialog v-model="opened">
    <v-card
      class="basic-modal card-width-560"
      data-testid="staging-modal"
      elevation="4"
    >
      <v-card-title class="d-flex justify-space-between">
        <h5 class="heading--text d-flex align-center">
          <v-icon
            class="create-staging-modal__icon mr-4"
            color="primary"
            icon="$wrench"
            size="24"
          />

          <span>{{ t('heading.instance.staging.title') }}</span>
        </h5>

        <modal-close-button
          v-if="!submitting"
          @click="opened = false"
        />
      </v-card-title>

      <v-card-text>
        <div class="d-flex flex-column">
          <AppMessage
            v-if="billable"
            class="create-staging-modal__billable mb-5"
            data-testid="staging-billable"
            variant="warning"
          >
            <p>{{ t('heading.instance.staging.alert.additionalCharge') }}</p>
          </AppMessage>

          <AppMessage
            v-if="parts.assignedByEngine"
            class="create-staging-modal__assigned mb-5"
            data-testid="staging-assigned-domain"
            variant="info"
          >
            <p>{{ t('heading.instance.modal.createStaging.assignedDomain') }}</p>
          </AppMessage>

          <template v-else>
            <label class="base--text mb-2">
              {{ parts.allowAnyDomain ? t('form.label.domain') : t('form.label.subdomain') }}
              <form-help-icon :text="parts.allowAnyDomain ? t('tooltip.create_staging.domain') : t('tooltip.create_staging.subdomain')" />
            </label>

            <validated-text-field
              v-if="parts.allowAnyDomain"
              v-model="domain"
              class="v-input--md"
              data-testid="staging-domain"
              density="compact"
              hide-details="auto"
              :rules="domainRules"
              validate-on="blur"
              variant="outlined"
            />

            <template v-else>
              <text-select-input
                v-model:text="subdomain"
                :available-select-options="selectOptions"
                data-testid="staging-domain"
                readonly
                :select="parts.parentDomain"
                :suffix="parts.suffix"
                @update:value="domain = $event"
              />

              <div
                v-if="domainError"
                class="base--text mt-2 text-error"
                data-testid="staging-domain-error"
              >
                {{ domainError }}
              </div>

              <div
                v-else-if="stagingAddress"
                class="base--text mt-2"
                data-testid="staging-address"
              >
                {{ t('heading.instance.modal.createStaging.addressHint', { domain: stagingAddress }) }}
              </div>
            </template>
          </template>
        </div>

        <div
          v-if="!hidden"
          class="last-child d-flex flex-column align-start w-100 mt-4"
          data-testid="staging-disk"
        >
          <template v-if="loadingUsage">
            <span>{{ t('heading.instance.modal.createStaging.calculatingUsage') }}...</span>

            <v-skeleton-loader
              class="w-100 bg-text"
              type="text"
            />
          </template>

          <template v-else>
            <ul>
              <li>
                {{ t('heading.instance.modal.createStaging.wordpressUsage') }}:
                <strong>{{ wpUsage }}</strong>
              </li>

              <li>
                {{ t('heading.instance.modal.createStaging.uploadsDirUsage') }}:
                <strong>{{ uploadsUsage }}</strong>
              </li>

              <li>
                {{ t('heading.instance.modal.createStaging.availableDiskSpace') }}:
                <strong> {{ availableSpace }} </strong>
              </li>
            </ul>

            <label class="base--text checkbox-label d-flex align-center p-2 mt-2">
              <checkbox
                v-model="skipUploadsDir"
                class="mr-1"
                data-testid="staging-skip-uploads"
                :disabled="forceSkip"
                :label="t('form.label.skip_uploads_dir')"
              />

              <form-help-icon :text="t('tooltip.create_staging.skip_uploads_dir')" />
            </label>
          </template>
        </div>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap pb-4 pt-8">
        <div class="w-100 pb-2">
          <AppButton
            block
            data-testid="staging-submit"
            :disabled="loadingUsage"
            kind="primary"
            :loading="submitting"
            size="large"
            @click="submit()"
          >
            <template #loader>
              <loader color="white" no-margins :size="20" />
            </template>

            <span class="p-2 font-weight-600">{{ t('button.createStaging') }}</span>
          </AppButton>
        </div>

        <div class="w-100 pb-2">
          <AppButton
            block
            data-testid="staging-cancel"
            :disabled="submitting"
            kind="text"
            size="large"
            @click="opened = false"
          >
            <span class="p-2 font-weight-light text-gray-darken-1">{{ t('button.cancel') }}</span>
          </AppButton>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // Runs its own requests (`ShareInstanceModal` precedent): the host calls `open(instance)` and reacts to `created`. The retry-staging
  // branch (`retryId`) is not reachable from the list. Submit does not validate the form, as legacy.
  import type { CreateStagingBody, StagingDiskUsage } from '@/entities/project/instance-actions.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import {
    availableDiskSpace,
    emptyUsage,
    forceSkipUploadsDir,
    hideDiskUsage,
    isStagingBillable,
    isValidDomain,
    loadDomainParser,
    needsDomainParser,
    stagingDomainParts,
    uploadsDirUsage,
    wpDiskUsage,
  } from '@/entities/project/create-staging'
  import { createStaging, getStagingDiskUsage } from '@/entities/project/instance-actions.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import TextSelectInput from '@/shared/ui/form/TextSelectInput.vue'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  const emit = defineEmits<{
    created: [staging: Record<string, unknown>]
    close: []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)
  // Legacy V2 `VDialog` shifts the page under 768px while open (`html.overflow-y-hidden`, `_dialog.scss`).
  useMobileScrollLock(opened)
  const submitting = ref(false)
  const loadingUsage = ref(false)
  const instance = ref<InstanceResource | null>(null)
  const usage = ref<StagingDiskUsage>(emptyUsage())
  const domain = ref('')
  const skipUploadsDir = ref(false)

  const parts = computed(() => instance.value
    ? stagingDomainParts(instance.value as never)
    : { allowAnyDomain: false, subdomain: 'staging', parentDomain: 'example.com', suffix: '.', domain: '', assignedByEngine: false })
  const subdomain = ref('')
  const domainError = ref('')
  const stagingAddress = computed(() => parts.value.allowAnyDomain || !subdomain.value
    ? ''
    : `${subdomain.value}${parts.value.suffix}${parts.value.parentDomain}`)
  const hidden = computed(() => instance.value ? hideDiskUsage(instance.value as never) : false)
  const billable = computed(() => instance.value ? isStagingBillable(instance.value as never) : false)
  const forceSkip = computed(() => forceSkipUploadsDir(usage.value))
  const wpUsage = computed(() => wpDiskUsage(usage.value))
  const uploadsUsage = computed(() => uploadsDirUsage(usage.value))
  const availableSpace = computed(() => availableDiskSpace(usage.value, String(t('heading.instance.modal.createStaging.unlimited'))))
  const selectOptions = computed(() => [{ label: parts.value.parentDomain, value: parts.value.parentDomain }])

  // The subdomain field takes the name only, because the panel appends the project's domain to it.
  const domainRules = [
    (value: unknown) => Boolean(value) || String(t('form.validation.required', { field: t('form.label.domain') })),
    (value: unknown) => isValidDomain(String(value)) || String(t('form.validation.valid', { field: t('form.label.domainName') })),
  ]

  function subdomainError (): string {
    const label = String(t('form.label.subdomain'))
    if (!subdomain.value.trim()) {
      return String(t('form.validation.required', { field: label }))
    }
    if (subdomain.value.includes('.')) {
      return String(t('form.validation.singleName', { field: label }))
    }
    return isValidDomain(domain.value) ? '' : String(t('form.validation.valid', { field: t('form.label.domainName') }))
  }

  watch(subdomain, () => {
    domainError.value = ''
  })

  // Legacy `:checked` + `:disabled` on the checkbox: a short space forces the box on.
  watch(forceSkip, value => {
    if (value) {
      skipUploadsDir.value = true
    }
  })

  // Closing from outside (the X, Esc, a click on the scrim) also reports it.
  watch(opened, value => {
    if (!value) {
      emit('close')
    }
  })

  async function loadUsage (target: InstanceResource): Promise<void> {
    loadingUsage.value = true
    usage.value = emptyUsage()
    try {
      usage.value = await getStagingDiskUsage(target.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingUsage.value = false
    }
  }

  // A newer `open` (or the unmount) while the suffix list loads wins: the older call stops after its `await`.
  let openSeq = 0
  onBeforeUnmount(() => {
    openSeq += 1
  })

  async function open (target: InstanceResource): Promise<void> {
    const seq = ++openSeq
    if (needsDomainParser(target as never)) {
      try {
        await loadDomainParser()
      } catch (error) {
        if (seq === openSeq) {
          alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
        }
        return
      }
      if (seq !== openSeq) {
        return
      }
    }
    instance.value = target
    skipUploadsDir.value = false
    const resolved = stagingDomainParts(target as never)
    domainError.value = ''
    subdomain.value = resolved.subdomain
    domain.value = resolved.domain
    if (!hideDiskUsage(target as never)) {
      void loadUsage(target)
    }
    opened.value = true
  }

  async function submit (): Promise<void> {
    const target = instance.value
    if (!target) {
      return
    }
    if (!parts.value.allowAnyDomain && !parts.value.assignedByEngine) {
      const error = subdomainError()
      if (error) {
        domainError.value = error
        return
      }
    }
    submitting.value = true
    try {
      // A copy of a site on panelalpha.online sends no domain: the Engine allocates and registers one.
      const body: CreateStagingBody = { skip_uploads_dir: forceSkip.value ? true : skipUploadsDir.value }
      if (!parts.value.assignedByEngine) {
        body.domain = domain.value
      }
      const staging = await createStaging(target.id, body)
      alerts.addAlert({ success: true, successMessage: String(t('notification.instance.modal.staging.create.success')) })
      opened.value = false
      emit('created', staging)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  defineExpose({ open })
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>

<style lang="scss" scoped>
// The global `.v-icon` colour beats the `color` prop in V4; legacy `color="primary"` on the title icon.
.create-staging-modal__icon {
  color: var(--v-primary-base);
}

// V2 `.text` palette class also set the text colour (gray-lighten1, `#9494ad`); V4 `bg-text` sets `on-text` (white).
.v-skeleton-loader.bg-text {
  color: var(--v-gray-lighten1);
}

// V2 text bone: 12px high with a 6px bottom margin; V4 gives `.v-skeleton-loader__text` a 16px margin on every side.
.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  margin: 0 0 6px;
}
</style>
