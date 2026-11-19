<template>
  <div data-testid="instance-avatar">
    <v-avatar
      v-if="!fetching"
      class="instance-avatar"
      :class="isSmall ? 'v-avatar--small' : ''"
      color=""
      data-testid="instance-table-avatar"
      elevation="0"
      :size="size"
    >
      <v-menu
        v-if="instance.hasActionInProgress() || installFailed"
        center
        :close-on-content-click="false"
        :max-width="292"
        :offset="[14, 0]"
        open-delay="150"
        open-on-hover
        transition="custom-tooltip"
      >
        <template #activator="{ props: activatorProps }">
          <div
            v-bind="activatorProps"
            :class="{ 'cursor-pointer': installFailed }"
          >
            <instance-avatar-img-error
              v-if="installFailed"
              :is-small="isSmall"
            />

            <loader
              v-else
              :color="instance.colorScheme === 'primary' ? 'success' : instance.colorScheme"
              no-margins
              :size="14"
            />
          </div>
        </template>

        <div
          class="text-center bg-surface"
          :class="state ? 'px-4 py-4' : 'px-4 py-2'"
        >
          <template v-if="!state">
            <span class="text-center p-4">
              {{ t('message.instance.hasSubinstance', { label: instance.subinstanceLabel }) }}
            </span>
          </template>

          <template v-else-if="state === 'error' && isImport">
            <span class="text-center p-4">
              {{ t('message.status.importing.failed') }}
            </span>

            <div class="d-flex w-100 justify-center mt-2">
              <AppButton
                class="mr-2 px-2"
                kind="primary"
                max-height="24px"
                size="x-small"
                @click="emit('show-import-details')"
              >
                <span class="p-5">{{ t('button.import.details') }}</span>
              </AppButton>

              <AppButton
                class="px-2"
                color="success"
                kind="primary"
                max-height="24px"
                size="x-small"
                @click="emit('restart-installation')"
              >
                <span class="p-5">{{ t('button.try') }}</span>
              </AppButton>
            </div>
          </template>

          <template v-else-if="state === 'in_progress' && isImport">
            <span class="text-center p-4">
              {{ t('message.status.importing.inProgress') }}
            </span>

            <v-progress-linear
              class="mb-1 mt-2"
              color="primary"
              :indeterminate="stepPercent === null"
              :model-value="stepPercent === null ? 0 : stepPercent"
              rounded
            />

            <div
              v-if="stepPercent !== null && isImport"
              class="d-flex flex-column align-center mt-1 mb-2"
            >
              <span
                v-if="currentStep"
                class="p-5 text--gray-darken1 text-center"
              >
                {{ t(`heading.instance.modal.importDetails.step.${currentStep.name}.title`) }}
              </span>

              <span
                v-else
                class="p-5 text--gray-darken1 text-center"
              >
                {{ t('message.importing.modal.progress') }}
              </span>
            </div>

            <div class="d-flex w-100 justify-center mt-2">
              <AppButton
                class="mr-2 px-2"
                kind="primary"
                max-height="24px"
                size="x-small"
                @click="emit('show-import-details')"
              >
                <span class="p-5">{{ t('button.import.details') }}</span>
              </AppButton>

              <AppButton
                class="px-2"
                kind="danger"
                max-height="24px"
                size="x-small"
                @click="emit('cancel-installation')"
              >
                <span class="p-5">{{ t('button.import.cancel') }}</span>
              </AppButton>
            </div>
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

      <v-img
        v-else-if="instance.screenshot_url"
        cover
        position="top center"
        :src="instance.screenshot_url"
      />

      <instance-avatar-img-not-available
        v-else
        :is-small="isSmall"
      />

      <div
        v-if="!instance.hasInstallStatus() && !instance.hasIpAddressInUrl()"
        class="icon-container elevation-4"
        :class="isSmall ? 'icon-container--small' : ''"
      >
        <dns-ssl-indicator
          :documentation-link="documentationLink"
          :instance="instance"
          :single-server="singleServer"
          @dns-propagation-in-progress="emit('dns-propagation-in-progress')"
        />
      </div>
    </v-avatar>

    <v-skeleton-loader
      v-else
      type="avatar"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import DnsSslIndicator from './DnsSslIndicator.vue'
  import InstanceAvatarImgError from './InstanceAvatarImgError.vue'
  import InstanceAvatarImgNotAvailable from './InstanceAvatarImgNotAvailable.vue'

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    size?: number | string
    fetching?: boolean
    installFailed?: boolean
    /** Passed to the DNS/SSL indicator: the Fix DNS dialog shows the preview box on single server. */
    singleServer?: boolean
    /** Passed to the DNS/SSL indicator: the link `DnsOptions` shows. */
    documentationLink?: string
  }>(), {
    size: 64,
    fetching: false,
    installFailed: false,
    singleServer: false,
    documentationLink: '',
  })

  const emit = defineEmits<{
    'dns-propagation-in-progress': []
    'show-import-details': []
    'cancel-installation': []
    'restart-installation': []
  }>()

  const { t } = useTranslation()

  const isSmall = computed(() => Number(props.size) < 64)

  const state = computed(() => {
    if (!props.instance.hasInstallStatus()) {
      return false
    }
    return props.instance.hasInstallFailed() ? 'error' : 'in_progress'
  })

  const isImport = computed(() => props.instance.import_details !== null)

  const currentStep = computed(() => (props.instance.import_details as { current_step?: { name: string, percent?: unknown } | null } | null)?.current_step ?? null)

  const stepPercent = computed(() => {
    if (!currentStep.value) {
      return null
    }
    const percent = currentStep.value.percent
    return typeof percent === 'number' ? percent : null
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-avatar {
  z-index: 9;
  position: relative;
  overflow: visible;
  // V2 `color=""` left the avatar without a background; V4 `.v-avatar--variant-flat` paints the surface colour.
  background-color: transparent;
  border: none;
  border-color: var(--v-gray-lighten2) !important;
  border-style: solid !important;
  border-width: 1px !important;
  color: var(--v-anchor-base);
  box-shadow: v.$box-shadow-avatar;

  &--small {
    box-shadow: none;
  }

  @media (max-width: 975px) {
    box-shadow: v.$box-shadow-avatar-mobile;
  }

  // V2 `.v-avatar .v-image { border-radius: inherit }`; the V4 `.v-img` has no radius of its own.
  .v-img {
    border-radius: inherit;
  }

  .preview-not-available {
    border-radius: 100%;
  }

  .icon-container {
    position: absolute;
    right: -8px;
    bottom: -4px;
    z-index: 2;
    height: 32px;
    width: 32px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: white;

    &--small {
      background-color: var(--v-panel-base);
      height: 24px;
      width: 24px;
      right: -4px;
      bottom: -8px;
    }
  }
}

.v-skeleton-loader {
  :deep(.v-skeleton-loader__avatar) {
    width: 64px;
    height: 64px;
  }
}

.cursor-pointer {
  cursor: pointer;
}
</style>
