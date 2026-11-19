<template>
  <div>
    <!--
      Legacy `offset-x` + `left` + `nudge-right -12px` (`!left`: `right` + `12px`): flush to the activator side, content top at the activator top
      (no `offset-y`), 12px further away, slid up (never flipped) when the card does not fit below. V4 connected flips it, so the
      position comes from `userInstancesTooltipLocation`.
      `eager`: V4 unmounts closed content, V2 kept it after the first open; the `StatusIndicator` menus and its resolve modal are
      teleported, so leaving the tooltip must not tear the indicator down mid-upload.
    -->
    <v-menu
      v-model="opened"
      :close-delay="150"
      :close-on-content-click="false"
      content-class="user-instances-tooltip"
      :disabled="!instancesCount"
      eager
      :location-strategy="locationStrategy"
      :max-height="445"
      :min-width="460"
      :open-delay="150"
      open-on-hover
    >
      <template #activator="{ props: activatorProps }">
        <div v-bind="activatorProps">
          <slot />
        </div>
      </template>

      <v-card
        data-testid="user-instances-tooltip"
        elevation="4"
        width="460"
      >
        <v-card-title class="px-5 py-4">
          <h5 class="user-instances-tooltip__title">
            {{ t('reseller.user.sharedInstances') }}
          </h5>
        </v-card-title>

        <v-divider />

        <v-card-text class="d-flex flex-column p-0">
          <template v-if="!fetching">
            <router-link
              v-for="(item, index) in instances"
              :key="`${item.id}-${index}`"
              class="d-flex align-center instance"
              data-testid="user-instance-row"
              :to="spaPath(item.id)"
            >
              <InstanceAvatar
                :documentation-link="documentationLink"
                :instance="item"
                :single-server="isSingleServer"
                :size="40"
              />

              <div class="d-flex flex-column instance__content flex-grow-1">
                <p class="d-flex align-center p-lg">
                  {{ item.title }}
                  <SuspendChip
                    v-if="item.service_status === 'suspended' || item.service_status === 'cancelled'"
                    class="ml-2"
                    data-testid="user-instance-suspended"
                    with-tooltip
                  />

                  <StatusIndicator
                    :key="item.id"
                    :ref="element => setIndicator(item.id, element)"
                    :instance="item"
                    :same-size="true"
                    :submitting="resolver.isSubmitting(item.id)"
                    @error="resolver.onError"
                    @resolve="payload => resolver.onResolve(item.id, payload, indicators[String(item.id)])"
                  />
                </p>

                <a
                  class="instance__link"
                  :href="item.url"
                  @click.stop
                >{{ item.url }}</a>
              </div>

              <div
                v-if="item.created_at"
                class="instance__created p-sm"
              >
                <span>{{ t('reseller.user.created') }}:</span>
                <span class="font-weight-bold">{{ new Date(item.created_at).toLocaleDateString('gb-GB') }}</span>
              </div>
            </router-link>
          </template>

          <template v-else>
            <div
              v-for="item in 5"
              :key="item"
              class="d-flex py-2 px-6"
              data-testid="user-instances-skeleton"
            >
              <v-skeleton-loader
                class="bg-text my-1 user-instances-tooltip__avatar"
                type="avatar"
              />

              <div class="d-flex flex-column ml-4">
                <v-skeleton-loader
                  class="bg-text mb-1"
                  height="16"
                  type="text"
                  width="140"
                />

                <v-skeleton-loader
                  class="bg-text"
                  height="14"
                  type="text"
                  width="80"
                />
              </div>
            </div>
          </template>
        </v-card-text>

        <v-divider />

        <div class="user-instances-tooltip__footer">
          <AppButton
            class="py-0 px-3"
            data-testid="user-instances-full-list"
            kind="field"
            :to="instancesListPath"
          >
            {{ t('reseller.user.fullList') }}
            <v-icon
              class="mr-0"
              color="primary"
              icon="$fillArrowRight"
              :size="16"
            />
          </AppButton>
        </div>
      </v-card>
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
  import type { ResellerUser } from '@/views/reseller/reseller.api'
  // Links go through `spaResourcePath` / `preferredSpaBase`, which cover both sources.
  // Legacy `:ssl="true"` on `InstanceAvatar` has no counterpart in the next kit (the avatar reads the SSL state itself).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { listResellerUserInstances } from '@/views/reseller/reseller.api'
  import InstanceAvatar from '@/entities/project/ui/InstanceAvatar.vue'
  import StatusIndicator from '@/entities/project/ui/status-issues/StatusIndicator.vue'
  import SuspendChip from '@/entities/project/ui/SuspendChip.vue'
  import { type IssueIndicator, useIssueResolve } from '@/entities/project/use-issue-resolve'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { userInstancesTooltipLocation } from './user-instances-tooltip-location'

  const props = withDefaults(defineProps<{
    user: ResellerUser
    instancesCount: number
    left?: boolean
  }>(), {
    left: false,
  })

  const { t } = useTranslation()
  const session = useSessionStore()
  const alerts = useAlertsStore()
  const { spaPath, isSingleServer } = useSpaResourcePath()

  const opened = ref(false)
  const locationStrategy = computed(() => userInstancesTooltipLocation(props.left))
  const fetching = ref(false)
  const instances = ref<InstanceResource[]>([])

  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))
  const instancesListPath = computed(() => preferredSpaBase(session.home))

  // The tooltip hosts the `StatusIndicator`s, so it owes them the issue resolve.
  const resolver = useIssueResolve()
  const indicators: Record<string, IssueIndicator | undefined> = {}

  function setIndicator (id: number | string, element: unknown): void {
    indicators[String(id)] = (element ?? undefined) as IssueIndicator | undefined
  }

  // One request per row, also for a user with no instances (N+1 kept as in legacy).
  async function fetchInstances (): Promise<void> {
    fetching.value = true
    try {
      instances.value = await listResellerUserInstances(props.user.id, session.home)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetching.value = false
    }
  }

  onMounted(fetchInstances)
</script>

<style lang="scss">
// Legacy `<style lang="scss">` is unscoped: the menu content is teleported, so it is reached through `content-class`.
// V2 `.v-card__text` / `.v-card__actions` are `.v-card-text` / `.v-card-actions` in V4.
// The anchor `.v-overlay__content` raises the specificity over the V4 `.v-menu > .v-overlay__content { overflow: auto }`, so `overflow` needs no `!important`.
.v-menu > .v-overlay__content.user-instances-tooltip.user-instances-tooltip {
  overflow: hidden;
  // The connected strategy writes the activator width as an inline `min-width` and ignores the prop.
  min-width: 460px !important;
  color: var(--v-text-base);

  .v-card-text {
    padding: 8px;
    max-height: 240px;
    overflow-y: auto;
  }

  .v-card-actions {
    padding: 16px;
  }

  .instance {
    padding: 8px 16px;
    gap: 16px;
    transition: background-color 0.2s ease;
    text-decoration: none;
    // The global `.v-application a` colour of V2 (primary); V4 paints the UA link colour.
    color: var(--v-primary-base);

    &:hover {
      background-color: var(--v-gray-lighten5);
    }

    p {
      gap: 8px;
      margin-bottom: 0;
      font-weight: 700;
      color: var(--v-text-darken2);
    }

    .status-indicator-container {
      min-height: unset;
    }

    &__link {
      color: var(--v-gray-darken1);
    }

    &__created {
      display: flex;
      flex-direction: column;
      text-align: right;
      color: var(--v-gray-darken1);
    }
  }

  .user-instances-tooltip__footer {
    display: flex;
    padding: 16px 24px;
    gap: 16px;
  }

}

// V2 `.v-card__title` is a flex row (the heading shrinks to its text); V4 is a block.
.v-overlay__content.user-instances-tooltip .v-card-title {
  display: flex;
}

// The V2 skeleton root is transparent, 48px for an avatar bone, and takes the theme secondary text colour; V4 adds margins and a min size.
.user-instances-tooltip .v-skeleton-loader {
  color: var(--v-skeleton-text);
}

.user-instances-tooltip .v-skeleton-loader.user-instances-tooltip__avatar {
  display: flow-root;
  width: 48px;
  min-width: 0;
  height: 48px;
  min-height: 0;

  .v-skeleton-loader__avatar {
    margin: 0;
  }
}

.user-instances-tooltip__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 26px;
  // The V2 reset zeroed heading margins; V4 keeps the UA `margin-block`.
  margin: 0;
}
</style>
