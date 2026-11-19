<template>
  <v-dialog
    v-model="open"
    transition="custom-dialog-transition"
    width="560px"
  >
    <v-card
      class="basic-modal"
      data-testid="report-provider-code-modal"
      elevation="4"
      width="560px"
    >
      <v-card-title class="d-flex justify-space-between">
        <h5>
          <v-icon
            class="mr-4"
            color="primary"
            icon="$lockoutline"
            :size="24"
          />
          {{ t('heading.instance.modal.code.title') }}
        </h5>

        <ModalCloseButton
          @click="open = false"
        />
      </v-card-title>

      <v-card-text class="pb-4">
        <p class="p-1">
          {{ t('heading.instance.modal.code.message') }}
        </p>

        <div class="recovery-code-box">
          <pre class="wrapped-text">{{ code }}</pre>

          <CopyTextButton
            color="primary"
            :size="24"
            :text="code"
          />
        </div>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap pb-8">
        <div class="w-100">
          <AppButton
            block
            kind="primary"
            size="x-large"
            @click="open = false"
          >
            {{ t('button.back') }}
          </AppButton>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // The tracking code of the report provider, copyable.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const open = defineModel<boolean>({ default: false })

  const { t } = useTranslation()

  const code = computed(() => props.instance.health_checks?.report_provider?.code ?? '')
</script>

<style lang="scss" scoped>
// Legacy `.v-card__title` min-height 96px and the text weight of the modal (V4 class names).
.v-card-title {
  min-height: 96px;
}

.v-card-text {
  font-weight: 300;
}

.recovery-code-box {
  display: flex;
  width: 100%;
  justify-content: center;
  align-items: flex-start;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-deploy-accent), 0.05);
  border-radius: 6px;
  padding: 6px;
}

.wrapped-text {
  word-wrap: break-word;
  white-space: pre-wrap;
  width: 430px;
}
</style>
