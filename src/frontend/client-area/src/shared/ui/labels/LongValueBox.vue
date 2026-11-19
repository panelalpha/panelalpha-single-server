<template>
  <div
    class="long-value-box"
    data-testid="long-value-box"
  >
    <div
      v-if="!expanded"
      class="box d-flex align-center"
    >
      <v-tooltip
        :close-delay="0"
        location="bottom"
        max-width="none"
        :open-delay="150"
        transition="custom-tooltip"
      >
        <template #activator="{ props: activatorProps }">
          <div
            v-bind="activatorProps"
            class="value-wrapper"
          >
            <span
              class="value"
              :class="{ monospace }"
            >
              {{ value }}
            </span>
          </div>
        </template>

        <span
          class="p-2"
          :class="{ monospace }"
        >{{ value }}</span>
      </v-tooltip>

      <copy-text-button
        v-if="canCopy"
        :color="copyColor"
        size="24"
        :text="value"
      />

      <AppButton
        v-if="canExpand"
        class="ml-2"
        kind="link"
        size="small"
        @click="expanded = true"
      >
        {{ ' ' + t('button.more') + ' ' }}
      </AppButton>
    </div>

    <div
      v-else
      class="expanded"
    >
      <v-textarea
        auto-grow
        class="textarea"
        :class="{ monospace }"
        hide-details
        :model-value="value"
        readonly
        variant="outlined"
      >
        <template #append>
          <copy-text-button
            v-if="canCopy"
            :color="copyColor"
            size="24"
            :text="value"
          />
        </template>
      </v-textarea>

      <div class="d-flex justify-end mt-2">
        <AppButton
          kind="link"
          size="small"
          @click="expanded = false"
        >
          {{ ' ' + t('button.close') + ' ' }}
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Used by TransferDomainModal, SetYourDomainModal and the onboarding.
  import { useTranslation } from 'i18next-vue'
  import { ref, watch } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'

  const props = withDefaults(defineProps<{
    value?: string
    monospace?: boolean
    canCopy?: boolean
    canExpand?: boolean
    copyColor?: string
  }>(), {
    value: '',
    monospace: true,
    canCopy: true,
    canExpand: true,
    copyColor: 'primary',
  })

  const { t } = useTranslation()

  const expanded = ref(false)

  watch(() => props.value, () => {
    expanded.value = false
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// Fixed literal green, not the brand colour, so the token --v-deploy-accent.
.box {
  width: 100%;
  background: rgba(var(--v-deploy-accent), 0.05);
  border-radius: 6px;
  padding: 12px 12px;
  border: 1px solid rgba(var(--v-deploy-accent), 0.12);
}

.value-wrapper {
  flex: 1;
  min-width: 0;
}

.value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(var(--v-theme-primary));
  font-weight: v.$font-weight-bold;
}

.textarea :deep(.v-field) {
  border-radius: 6px;
}

.monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  letter-spacing: 0.2px;
}
</style>
