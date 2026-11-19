<template>
  <div v-if="visibleSteps.length > 0" class="deploy-steps">
    <div class="p-4 text-gray-darken-1 mb-1">
      {{ t('heading.instance.siteDetails.redeploy.steps.title') }}
    </div>

    <div v-if="note" class="p-4 text-gray-darken-1 mb-3">
      {{ note }}
    </div>

    <div
      v-for="step in visibleSteps"
      :key="step.key"
      class="deploy-steps__step mb-3"
      :data-step="step.key"
    >
      <Checkbox
        v-if="step.skippable"
        color="primary"
        :disabled="disabled"
        :label="stepLabel(step.key)"
        :model-value="!modelValue.includes(step.key)"
        @update:model-value="toggle(step.key, $event)"
      />

      <div v-else class="d-flex align-center">
        <v-icon class="mr-2" color="success" size="16">$check</v-icon>
        <span class="text-text-darken-2 font-weight-bold">{{ stepLabel(step.key) }}</span>
      </div>

      <div class="deploy-steps__commands deploy-steps__mono text-gray-darken-1">
        <div v-for="(command, index) in step.commands" :key="index">
          {{ command }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The kit component is named like legacy;
  // the logic lives in deploy-skip.ts. Not to be confused with DeployStepsList (the log stages).
  import type { DeployStepKey, ProjectSourceDeployStep } from '@/entities/project/project-source.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { toggleSkipped, visibleDeploySteps } from './deploy-skip'

  const props = withDefaults(defineProps<{
    steps?: Partial<Record<DeployStepKey, ProjectSourceDeployStep>> | null
    note?: string
    disabled?: boolean
  }>(), {
    steps: null,
    note: '',
    disabled: false,
  })

  // Categories the user unchecked, i.e. skipped for this deploy.
  const modelValue = defineModel<DeployStepKey[]>({ default: () => [] })

  const { t } = useTranslation()

  const visibleSteps = computed(() => visibleDeploySteps(props.steps))

  function stepLabel (key: DeployStepKey): string {
    return t(`heading.instance.siteDetails.redeploy.steps.${key}`)
  }

  function toggle (key: DeployStepKey, checked: boolean | null): void {
    modelValue.value = toggleSkipped(modelValue.value, key, checked === true)
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;
// Legacy V2 colours the checked row's root (the `.v-input` carries the primary text colour through `.active`); V4 keeps it on the box only.
.deploy-steps__step :deep(.v-input.v-checkbox.active) {
  color: map.get(v.$primary, base);
}

// Monospace stack and 12 px size kept 1:1 (font-family is not a colour literal).
.deploy-steps__commands {
  margin-left: 24px;
  margin-top: 4px;
  font-size: 12px;
  word-break: break-all;
}

.deploy-steps__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  letter-spacing: 0.2px;
}

// Legacy skippable row measured 48 px tall (`.v-input` of the V2 checkbox), the V4 box row is 22 px; the 26 px gap is the row, not the box.
.deploy-steps__step :deep(.v-input.v-checkbox) {
  min-height: 48px;
}
</style>
