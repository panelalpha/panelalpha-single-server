<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.copyInstance.title')">
      <v-col class="pb-2" cols="12">
        <SettingCard
          data-testid="copy-instance-card"
          :description="t('heading.instance.advanced.copyInstance.copy.subtitle')"
          :title="t('heading.instance.advanced.copyInstance.copy.title')"
        >
          <template #action>
            <AppButton
              block
              data-testid="copy-instance-open"
              kind="setting-action"
              @click="open = true"
            >
              <span class="font-weight-bold">{{ t('button.copyInstance') }}</span>
            </AppButton>
          </template>
        </SettingCard>
      </v-col>
    </AdvancedPageLayout>

    <AppDialog
      v-model="open"
      overlay
      :persistent="submitting"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <BasicModal
        :buttons="buttons"
        custom-class="copy-instance-modal card-width-560"
        data-testid="copy-instance-modal"
        icon="$copy"
        :submitting="submitting"
        :title="t('heading.instance.advanced.copyInstance.copy.title')"
        @button-click="onButton"
        @modal-close="close"
      >
        <template
          v-if="step === 'service'"
          #custom
        >
          <p class="p-3 mt-2">
            {{ t('heading.instance.advanced.copyInstance.modal.selectService.message') }}
          </p>

          <v-form>
            <v-select
              v-model="selected"
              class="v-input--lg"
              :disabled="submitting"
              hide-details
              :item-title="service => serviceLabel(service, t)"
              item-value="id"
              :items="services"
              :menu-props="{ offset: 8, closeOnContentClick: false, contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding' }"
              return-object
              variant="outlined"
            />

            <v-scale-transition>
              <AppMessage
                v-if="limitReached"
                class="my-5"
                icon="$alertcircle"
                variant="warning"
              >
                <span>
                  {{ t('heading.onboarding.chooseProduct.product.fullServiceAlert') }}
                </span>
              </AppMessage>
            </v-scale-transition>
          </v-form>
        </template>

        <template
          v-if="step === 'options'"
          #default
        >
          <!-- Step 2: one field per user configurable option, in the same modal. -->
          <basic-modal-field
            v-for="(field, index) in fields"
            :key="fieldName(field)"
            :field="field"
            :last="index === fields.length - 1"
            :model-value="values[fieldName(field)]"
            @update:model-value="setField(field, $event)"
          />
        </template>
      </BasicModal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  // The title and the card, and the step-1 modal.
  // Step 2 (the user configurable options): the same modal, fields composed in the default slot as `ActionModalHost` does.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { CopyDeps, CopyService } from '@/entities/project/instance-row-actions'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { copyInstance, getServiceInstanceOptions } from '@/entities/project/instance-actions.api'
  import { runCopy, submitCopy } from '@/entities/project/instance-row-actions'
  import { serviceLabel, serviceLimitReached } from '@/entities/service/service-display'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { fieldName } from '@/shared/ui/modal/use-action-modal'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()

  // The copy modal opens from the card button.
  const open = ref(false)
  const submitting = ref(false)
  const selected = ref<CopyService | null>(null)
  // Step 1 is the service select; step 2 is the user configurable options of the chosen service (`fields`, `values`).
  const step = ref<'service' | 'options'>('service')
  const fields = ref<ModalField[]>([])
  const values = ref<Record<string, unknown>>({})
  const services = computed(() => session.services as CopyService[])
  const limitReached = computed(() => serviceLimitReached(selected.value ?? undefined))

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.copyInstance'), color: 'primary' },
    cancelButton(t),
  ])

  useBodyScrollLock(open)

  // Every open and close preselects the first service again
  // and returns to step 1.
  watch(open, () => {
    selected.value = services.value[0] ?? null
    step.value = 'service'
    fields.value = []
    values.value = {}
  })

  // The copy request and the alerts of the instance page, narrowed to the copy steps.
  const deps: CopyDeps = {
    copyInstance,
    getServiceInstanceOptions,
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    t: (key, options) => String(t(key, options as never)),
  }

  function close (): void {
    if (!submitting.value) {
      open.value = false
    }
  }

  function onButton (id: string): void {
    if (id === 'cancel') {
      close()
      return
    }
    if (id === 'submit') {
      void copy()
    }
  }

  function setField (field: ModalField, value: unknown): void {
    values.value = { ...values.value, [fieldName(field)]: value }
  }

  // A failure keeps the dialog open with the alert, a success closes it.
  // Step 1 may move to step 2 (`submitCopy` → `options`); step 2 posts the values as `user_configurable_options`.
  async function copy (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (step.value === 'options') {
        const result = await runCopy(props.instance, values.value, deps)
        if (result.kind === 'copied') {
          open.value = false
        }
        return
      }

      const service = selected.value
      if (!service) {
        return
      }
      const result = await submitCopy(props.instance, { service_id: service.id }, services.value, deps)
      if (result.kind === 'copied') {
        open.value = false
      } else if (result.kind === 'options') {
        step.value = 'options'
        fields.value = result.modal.fields
        values.value = { ...result.modal.values }
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
// Legacy had `.v-select.v-input--lg input { display: none }`. Applied only if V4 shows a visible input
// next to the selected value.
// V2 painted the select of a submitting dialog as an enabled one (`color` stays the text colour, no dimming); V4 dims every disabled input to 0.38.
.copy-instance-modal :deep(.v-input--disabled),
.copy-instance-modal :deep(.v-field--disabled) {
  opacity: 1;
  color: var(--v-text-default);
}

.basic-modal :deep(.v-select.v-input--lg .v-field input) {
  display: none;
}
</style>
