<template>
  <v-dialog
    v-model="opened"
    persistent
    transition="fade-transition"
  >
    <v-card
      class="card-width-560"
      data-testid="cancel-install-dialog"
    >
      <v-card-title class="d-flex align-center justify-start">
        <v-icon
          class="mr-3"
          color="red"
          icon="$alertTriangle"
          size="20"
        />

        <h6 v-if="isImport">
          {{ t('heading.instance.modal.cancelInstanceImport.title') }}
        </h6>

        <h6 v-else>
          {{ t('heading.instance.modal.cancelInstanceInstallation.title') }}
        </h6>

        <modal-close-button
          data-testid="cancel-install-close"
          :disabled="loading"
          icon-color="gray"
          @click="close"
        />
      </v-card-title>

      <v-divider class="mb-6" />

      <v-card-text>
        <p
          v-if="isImport"
          class="p-d"
        >
          {{ t('heading.instance.modal.cancelInstanceImport.desc') }}
        </p>

        <p
          v-else
          class="p-d"
        >
          {{ t('heading.instance.modal.cancelInstanceInstallation.desc') }}
        </p>

        <div>
          <h4 class="mb-4 p-2 font-weight-600">
            {{ t('message.confirmAction') }}
          </h4>

          <label
            class="base--text checkbox-label d-flex align-center p-2"
          >
            <checkbox
              v-model="confirmed"
              color="primary"
              data-testid="cancel-install-confirm"
              :label="isImport ? t('heading.instance.modal.cancelInstanceImport.checkbox') : t('heading.instance.modal.cancelInstanceInstallation.checkbox')"
            />
          </label>
        </div>
      </v-card-text>

      <v-card-actions class="pt-7 pb-3 d-flex flex-column align-center justify-space-between">
        <AppButton
          block
          class="cancel-submit"
          data-testid="cancel-install-submit"
          :disabled="!confirmed || loading"
          kind="danger"
          :loading="loading"
          size="large"
          @click="confirm"
        >
          <template #loader>
            <loader color="white" no-margins :size="20" />
          </template>

          <span
            v-if="isImport"
            class="text-white"
          >{{ t('button.import.cancel') }}</span>

          <span
            v-else
            class="text-white"
          >{{ t('button.installation.cancel') }}</span>
        </AppButton>

        <AppButton
          block
          class="mt-2"
          data-testid="cancel-install-resume"
          :disabled="loading"
          kind="text"
          size="large"
          @click="close"
        >
          <span
            v-if="isImport"
            class="text--gray-darken1"
          >{{ t('button.import.resume') }}</span>

          <span
            v-else
            class="text--gray-darken1"
          >{{ t('button.installation.resume') }}</span>
        </AppButton>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // The confirmation every
  // Cancel Installation button in `My Projects` opens (card overlay, card indicator, table kebab and name cell). The host runs the
  // cancel (`runCancelInstallation`) and closes the dialog when it resolves; the checkbox starts unchecked on every open.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  const props = withDefaults(defineProps<{
    instance: InstanceResource | null
    /** The cancel request runs: both buttons and the X are disabled, the red one shows its loader. */
    loading?: boolean
  }>(), {
    loading: false,
  })

  const emit = defineEmits<{
    confirm: []
    close: []
  }>()

  const opened = defineModel<boolean>({ default: false })
  useMobileScrollLock(opened)

  const { t } = useTranslation()

  const confirmed = ref(false)

  const isImport = computed(() => props.instance !== null && props.instance.import_details !== null)

  watch(opened, value => {
    if (!value) {
      confirmed.value = false
    }
  })

  function confirm (): void {
    if (!props.loading) {
      emit('confirm')
    }
  }

  // No-op while the request runs.
  function close (): void {
    if (props.loading) {
      return
    }
    opened.value = false
    emit('close')
  }
</script>

<style lang="scss" scoped>
// V2 vendor `.v-card__title { flex-wrap: wrap }`: on a narrow screen the X drops under the title instead of squeezing it.
.v-card-title {
  flex-wrap: wrap;
}

// V4's `.v-card-actions` has a 0.5rem flex gap V2 did not.
.v-card-actions.pt-7 {
  gap: 0;
}

// V2 `color="red"` paints only the fill: the button keeps its text colour `rgba(0,0,0,.87)` (the white is the label span's `white--text`),
// so the focus layer (`currentColor`) darkens the red. V4 `variant="flat"` sets `on-error` (white) on the button and the layer lightens it.
.cancel-submit {
  color: var(--v-text-default) !important;
}

// Height 24px (an inline style in legacy).
.checkbox-label {
  height: 24px;
}

// The V2 checkbox row is 48px (16px margin and 4px padding of `.v-input--selection-controls` around the 22px box) centred on its
// 24px label, so the box sits on the label's middle line; the V4 root is the 22px box alone.
.checkbox-label .checkbox {
  display: flex;
  align-items: center;
  height: 48px;
}

// V2 `.v-btn + .v-btn { margin-left: 8px }` shifts the centred block button by 4px.
.v-card-actions .v-btn + .v-btn {
  margin-left: 8px;
}
</style>
