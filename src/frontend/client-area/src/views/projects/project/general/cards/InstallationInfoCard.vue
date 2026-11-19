<template>
  <info-card :title="t('heading.instance.siteDetails.installation.title')">

    <v-card-text class="mb-4">
      <!-- A failed install is the project's state, not "WordPress is not installed": the site does not exist yet. -->
      <div
        v-if="instance.hasInstallFailed()"
        data-testid="installation-failed"
      >
        <span class="font-weight-bold p2 heading--text">
          <v-icon
            class="mb-1 mr-2"
            color="error"
            icon="$alerterror"
            size="16"
          />
          {{ t('message.status.install.failed') }} {{ t('button.try') }}
        </span>

        <div class="d-flex mt-3">
          <AppButton
            data-testid="installation-retry"
            kind="primary"
            size="small"
            @click="emit('action-button-retry', instance)"
          >
            <v-icon
              color="white"
              icon="$restore"
              size="16"
            />

            <span class="font-weight-bold">{{ t('button.try') }}</span>
          </AppButton>
        </div>
      </div>

      <v-row
        v-else
        no-gutters
      >
        <v-col
          class="d-flex flex-column pr-2 pl-0 pb-0 pt-0"
          cols="6"
        >
          <span class="p-3 mb-1">{{ t('general.wordpress') }}</span>
          {{ ' ' }}

          <template v-if="wordpress.version">
            <h1
              class="version"
              :class="wordpress.updateAvailable ? 'text-error' : 'text-primary'"
            >
              {{ wordpress.version }}
            </h1>
            {{ ' ' }}

            <span
              v-if="!wordpress.updateAvailable"
              class="p-4 mt-1"
            >
              <v-icon
                class="mb-1"
                color="success"
                icon="$alertok"
                size="16"
              />
              {{ t('message.status.updated') }}
            </span>

            <span
              v-else
              class="p-4 mt-1 lighten-text"
            >
              <v-icon
                class="mb-1"
                color="error"
                icon="$alertwarning"
                size="16"
              />
              {{ t('message.updateAvailable', { version: wordpress.updateVersion }) }}
            </span>
          </template>

          <template v-else-if="instance.hasUpdateInProgress()">
            <span class="p-4 mt-1 lighten-text">
              <v-icon
                class="mb-1"
                color="primary"
                icon="$update"
                size="16"
              />
              {{ t('message.status.update.inProgress') }}
            </span>
          </template>

          <template v-else>
            <span class="p-4 not-installed base--text">
              <v-icon
                class="mb-1 mr-2"
                color="gray"
                icon="$alerterror"
                size="16"
              />
              {{ t('message.status.install.no') }}
            </span>
            {{ ' ' }}

            <!-- Legacy has no handler on the WordPress install link; kept as is. -->
            <a class="p-3 d-flex align-center mt-1">
              <v-icon
                class="mr-2"
                color="primary"
                icon="$installIcon"
                size="16"
              />

              <span class="font-weight-bold mt-1">{{ t('button.installNow') }}</span>
            </a>
          </template>
          {{ ' ' }}
        </v-col>

        <v-col
          class="d-flex flex-column pl-2 pr-0 pb-0 pt-0"
          cols="6"
        >
          <span class="p-3 mb-1">{{ t('general.woocommerce') }}</span>
          {{ ' ' }}

          <h1
            v-if="woocommerce.version"
            class="version"
            :class="woocommerce.updateAvailable ? 'text-error' : 'text-primary'"
          >
            {{ woocommerce.version }}
          </h1>
          {{ ' ' }}

          <template v-if="woocommerce.version">
            <span
              v-if="!woocommerce.updateAvailable"
              class="p-4 mt-1"
            >
              <v-icon
                class="mb-1"
                color="primary"
                icon="$alertok"
                size="16"
              />
              {{ t('message.status.updated') }}
            </span>

            <span
              v-else
              class="p-4 mt-1"
            >
              <v-icon
                class="mb-1"
                color="error"
                icon="$alertwarning"
                size="16"
              />
              {{ t('message.updateAvailable', { version: woocommerce.updateVersion }) }}
            </span>
          </template>

          <template v-else-if="woocommerce.installing">
            <span class="p-4 mt-1 lighten-text">
              <v-icon
                class="mb-1"
                color="primary"
                icon="$installIcon"
                size="16"
              />
              {{ t('message.status.install.inProgress') }}
            </span>
          </template>

          <template v-else>
            <span class="p-4 not-installed base--text">
              <v-icon
                class="mb-1 mr-2"
                color="gray"
                icon="$alerterror"
                size="16"
              />
              {{ t('message.status.install.no') }}
            </span>
            {{ ' ' }}

            <a
              v-if="instance.hasManagePluginsPrivilege()"
              class="p-3 d-flex align-center mt-1 cursor-pointer"
              @click="emit('action-button-install-woocommerce', instance)"
            >
              <v-icon
                class="mr-2"
                color="primary"
                icon="$installIcon"
                size="16"
              />

              <span class="font-weight-bold mt-1">{{ t('button.installNow') }}</span>
            </a>
          </template>
        </v-col>
      </v-row>
    </v-card-text>

    <template #actions>
      <AppButton
        v-if="!wordpress.updateAvailable && !woocommerce.updateAvailable && wordpress.version"
        key="current"
        block
        class="font-weight-bold current-button"
        disabled
        kind="primary"
        :loading="instance.hasUpdateInProgress()"
      >
        <v-icon
          icon="$checkcircle"
          size="16"
        />

        <span
          v-if="woocommerce.version"
          class="primary-text"
        >{{ t('heading.instance.siteDetails.installation.current.system') }}</span>

        <span
          v-else
          class="primary-text"
        >{{ t('heading.instance.siteDetails.installation.current.wordpress') }}</span>
      </AppButton>

      <AppButton
        v-else-if="(wordpress.updateAvailable || woocommerce.updateAvailable) && instance.hasWordPressUpdatePrivilege()"
        key="update"
        block
        class="font-weight-bold text-white"
        kind="primary"
        :loading="instance.hasUpdateInProgress()"
        @click="onUpdateClick"
      >
        <v-icon icon="$update" size="16" />
        <span v-if="wordpress.updateAvailable">{{ t('button.wordpress.update') }}</span>
        <span v-else>{{ t('button.woocommerce.update') }}</span>
      </AppButton>
    </template>
  </info-card>
</template>

<script lang="ts" setup>
  // The lite title style and the lite button are used. The update modal is owned by the frame: the card emits `action-button-update` (WordPress) or
  // `action-update-woocommerce`. The WooCommerce install is emitted for the frame too.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { versionGreater } from '@/shared/version/compare-versions'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'action-button-update': [instance: InstanceResource]
    'action-button-retry': [instance: InstanceResource]
    'action-update-woocommerce': []
    'action-button-install-woocommerce': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()

  const wordpress = computed(() => ({
    version: props.instance.status.wordpress,
    updateAvailable: versionGreater(props.instance.status.wordpress_available, props.instance.status.wordpress),
    updateVersion: props.instance.status.wordpress_available,
  }))

  const woocommerce = computed(() => ({
    version: props.instance.status.woocommerce,
    installing: props.instance.status.woocommerce_installing === true,
    updateAvailable: versionGreater(props.instance.status.woocommerce_available, props.instance.status.woocommerce),
    updateVersion: props.instance.status.woocommerce_available,
  }))

  function onUpdateClick (): void {
    if (wordpress.value.updateAvailable) {
      emit('action-button-update', props.instance)
      return
    }
    emit('action-update-woocommerce')
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// The column, the card, the title, the body colour and the action button rules live in the kit pattern `InfoCard`.
.version {
  font-size: v.$font-size-h2;
  line-height: v.$line-height-h2;
}

.not-installed {
  display: flex;
  align-items: center;
  height: 36px;
}

// !important on both rules: they must beat the Vuetify text colour utilities / `.v-card-text` opacity colour on the same element.
.lighten-text {
  color: var(--v-gray-lighten1) !important;
}

.primary-text {
  color: var(--v-primary-base);
}

// Legacy `<a>` (install link) is the primary colour (V2 `a { color: primary }`); the card text colour would otherwise apply.
a {
  color: rgb(var(--v-theme-primary));
}
</style>
