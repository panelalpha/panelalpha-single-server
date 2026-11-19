<template>
  <div
    class="table-item table-item--name item--title"
    :class="main ? 'group-start' : ''"
  >
    <template v-if="main">
      <div class="item item--main">
        <component
          :is="item.hasInstallFailed() ? 'span' : RouterLink"
          :to="item.hasInstallFailed() ? undefined : spaPath(`${item.id}/general`)"
        >
          <instance-avatar
            :documentation-link="documentationLink"
            :install-failed="item.hasInstallFailed()"
            :instance="item"
            :single-server="singleServer"
            :size="40"
            @cancel-installation="emit('cancel-installation', item)"
            @dns-propagation-in-progress="isDnsPropagationInProgress = true"
            @restart-installation="restartInstall"
            @show-import-details="emit('show-import-details', item)"
          />
        </component>

        <div class="item__title-box">
          <div class="d-flex align-center">
            <component
              :is="!item.hasInstallInProgress() ? RouterLink : 'div'"
              class="d-flex align-center mw-100"
              :to="item.isActive ? spaPath(`${item.id}/general`) : ''"
            >
              <h6
                class="item__title text-truncate"
                data-testid="instance-table-title"
              >
                {{ item.title }}
              </h6>

              <SuspendChip
                v-if="isSuspended"
                class="ml-2"
                data-testid="instance-table-suspend-chip"
              />
            </component>

            <v-menu
              v-if="item.hasInstallFailed() && !isImportFailed"
              center
              :close-on-content-click="false"
              location="bottom"
              :max-width="292"
              :offset="[38, 0]"
              open-delay="150"
              open-on-hover
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <v-icon
                    class="ml-2 item__tooltip item__tooltip--failed"
                    color="error"
                    icon="$alertcircle"
                    size="16"
                  />
                </div>
              </template>

              <span>
                <div class="item__tooltip-content py-3 px-4 mb-0 p-sm text-center">
                  {{ t('message.status.instanceInstall.failed') }}
                  <a
                    class="text-underline text-info"
                    @click.stop.prevent="restartInstall"
                  >{{ t('button.try') }}</a>
                </div>
              </span>
            </v-menu>
          </div>

          <a
            class="item__url instance-domain-link p-4"
            data-testid="instance-table-url"
            :href="item.url"
          >{{ item.url }}</a>

          <preview-site-button
            v-if="session.home?.app?.integrations?.preview_site_provider_enabled && isDnsPropagationInProgress"
            :instance="item"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="item">
        <div class="item__title-box">
          <router-link :to="spaPath(`${item.subinstance!.id}/general`)">
            <p class="mb-0 p-2 font-weight-600 item__title">
              <v-tooltip
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <div
                    class="d-inline"
                    v-bind="activatorProps"
                  >
                    <label-chip
                      class="subinstance-label"
                      data-testid="instance-table-sub-label"
                      :item="{ title: item.subinstance!.subinstanceLabel, color: 'info' }"
                      xsmall
                    />
                  </div>
                </template>

                <span>
                  {{ t('message.instance.hasSubinstance', { label: item.subinstance!.subinstanceLabel }) }}
                </span>
              </v-tooltip>
              {{ item.subinstance!.title }}
            </p>
          </router-link>

          <a
            class="item__url p-4 instance-domain-link"
            :href="item.subinstance!.url"
          >{{ item.subinstance!.url }}</a>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  // app-lite builds the links with `$spaResourcePath`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import PreviewSiteButton from '@/views/projects/PreviewSiteButton.vue'
  import InstanceAvatar from '@/entities/project/ui/InstanceAvatar.vue'
  import SuspendChip from '@/entities/project/ui/SuspendChip.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import LabelChip from '@/shared/ui/labels/LabelChip.vue'

  // The sub-row passes `{ ...item, subinstance }`.
  const props = withDefaults(defineProps<{
    item: InstanceResource & { subinstance?: InstanceResource }
    main?: boolean
    index?: number
  }>(), {
    main: false,
    index: undefined,
  })

  const emit = defineEmits<{
    'restart-installation': [instance: InstanceResource]
    'cancel-installation': [instance: InstanceResource]
    'show-import-details': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const { spaPath } = useSpaResourcePath()

  const isDnsPropagationInProgress = ref(false)
  const singleServer = computed(() => Boolean(session.home?.app?.single_server?.active))
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))

  const isSuspended = computed(() => props.item.service_status === 'suspended' || props.item.service_status === 'cancelled')

  const isImportFailed = computed(() => props.item.hasInstallFailed() && props.item.import_details !== null)

  // Legacy also did `$root.$emit('instance-retry-install', item)` next to the emit, so a retry ran twice. The host raises the
  // bus event from this one emit.
  function restartInstall (): void {
    emit('restart-installation', props.item)
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.table-item {
  padding-left: 0;
}

.item {
  max-width: 100%;
  width: 100%;

  &__title {
    color: map.get(v.$text, headings);
    transition: color 0.24s ease;

    &:hover {
      color: map.get(v.$primary, darken1);
    }
  }

  &__title-box {
    max-width: calc(100% - 40px);

    > a {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
  }

  &:not(.item--main) {
    margin-left: 56px;
    position: relative;

    &::after {
      content: "";
      position: absolute;
      border-bottom: 1px solid var(--v-gray-lighten3);
      border-left: 1px solid var(--v-gray-lighten3);
      width: 30px;
      height: 68px;
      left: -36px;
      top: -32px;
    }
  }
}

// V2 `v-chip` is a 16px-radius chip without border or shadow, tinted by `color="info lighten-4 info--text"` (bg `info lighten-4`,
// text colour as `LabelChip` paints it); V4's is a pill with a thin border and an elevation shadow.
.subinstance-label.v-chip {
  // V2 colour classes set `background-color` and `border-color` together.
  // V4 `color="info"` paints `bg-info` with `!important`; the V2 `info lighten-4` tint has to win over it.
  background: var(--v-info-lighten4) !important;
  border: none;
  border-color: var(--v-info-lighten4);
  border-radius: 16px;
  box-shadow: none;
}

.mw-100 {
  max-width: 100%;
}

.item__tooltip {
  &.item__tooltip--failed {
    cursor: pointer;
  }
}
</style>
