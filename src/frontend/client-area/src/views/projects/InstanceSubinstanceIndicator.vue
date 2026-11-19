<template>
  <component
    :is="disabled ? 'span' : 'router-link'"
    class="instance-indicator-container"
    :to="disabled ? undefined : spaPath(`${instance.id}/general`)"
  >
    <v-menu
      :close-on-content-click="false"
      location="bottom"
      max-width="292"
      :offset="[20, rtl ? 120 : -120]"
      open-delay="150"
      open-on-hover
      origin="top center"
      transition="custom-tooltip"
    >
      <template #activator="{ props: activatorProps }">
        <div v-bind="activatorProps">
          <label-simple
            :item="{
              classColor: `text-${
                instance.hasInstallFailed()
                  ? 'error'
                  : instance.colorScheme === 'primary'
                    ? 'success'
                    : instance.colorScheme
              }`,
              title: instance.subinstanceLabel,
            }"
            small
          >
            <template v-if="instance.hasInstallFailed()">
              <v-icon
                color="error"
                icon="$alerterror"
                size="16"
              />
            </template>

            <template v-else-if="instance.hasActionInProgress()">
              <loader
                :color="instance.colorScheme === 'primary' ? 'success' : instance.colorScheme"
                no-margins
                :size="14"
              />
            </template>
          </label-simple>
        </div>
      </template>

      <div
        class="text-center"
        :class="state ? 'px-4 py-4' : 'px-4 py-2'"
      >
        <template v-if="!state">
          <span class="text-center p-4">
            {{ t('message.instance.hasSubinstance', { label: instance.subinstanceLabel }) }}
          </span>
        </template>

        <template v-else-if="state === 'error'">
          <span class="text-center p-4">
            {{ t('message.status.action.error') }}
          </span>

          <div class="d-flex w-100 justify-center mt-2">
            <AppButton
              class="mr-2 px-2"
              kind="primary"
              max-height="24px"
              size="x-small"
              @click="emit('restart-installation')"
            >
              <span class="p-5">{{ t('button.try') }}</span>
            </AppButton>

            <AppButton
              class="px-2"
              kind="danger"
              max-height="24px"
              size="x-small"
              @click="emit('cancel-installation')"
            >
              <span class="p-5">{{ t('button.installation.cancel') }}</span>
            </AppButton>
          </div>
        </template>

        <template v-else-if="state === 'in_progress'">
          <span class="text-center p-4">
            {{ t('message.status.action.inProgressLong') }}
          </span>

          <div class="d-flex w-100 justify-center mt-2">
            <AppButton
              class="px-2"
              kind="danger"
              max-height="24px"
              size="x-small"
            >
              <span class="px-5">{{ t('button.action.cancel') }}</span>
            </AppButton>
          </div>
        </template>
      </div>
    </v-menu>
  </component>
</template>

<script lang="ts" setup>
  // The Try again and Cancel buttons only emit; the host handles them.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRtl } from 'vuetify'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabelSimple from '@/shared/ui/labels/LabelSimple.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'restart-installation': []
    'cancel-installation': []
  }>()

  const { t } = useTranslation()
  const { isRtl: rtl } = useRtl()
  const { spaPath } = useSpaResourcePath()

  const state = computed(() => {
    if (!props.instance.hasInstallStatus()) {
      return false
    }
    return props.instance.hasInstallFailed() ? 'error' : 'in_progress'
  })

  const disabled = computed(() => Boolean(state.value))
</script>

<style lang="scss" scoped>
.disabled {
  pointer-events: none;
}

.label-simple {
  margin-right: 16px;

  // V2 `color="error"` on the icon.
  .v-icon {
    color: var(--v-error-base);
  }
}

[dir=rtl] {
  .label-simple {
    margin-right: 0px;
    margin-left: 16px;
  }
}
</style>
