<template>
  <div
    class="subinstance-bar px-6"
    :class="[
      instance?.colorScheme ? `subinstance-bar--${instance.colorScheme}` : '',
      fetching ? 'subinstance-bar--fetching' : '',
    ]"
  >
    <v-container class="px-0 d-flex align-end">
      <template v-if="!fetching || instance">
        <!-- LIVE first, then the staging copies. -->
        <v-menu
          v-for="item in tabs"
          :key="item.id"
          :close-on-content-click="false"
          :disabled="tabState(item) === false"
          location="bottom"
          min-width="272px"
          open-delay="150"
          open-on-hover
          transition="custom-tooltip"
        >
          <template #activator="{ props: activatorProps }">
            <AppButton
              v-bind="activatorProps"
              class="subinstance-bar__item"
              :class="[
                item.hasActionInProgress() ? 'subinstance-bar__in-progress' : '',
                item.colorScheme ? `subinstance-bar__item--${item.colorScheme}` : '',
                tabState(item) === 'in_progress' ? 'subinstance-bar__in-progress' : '',
                tabState(item) === 'error' ? 'subinstance-bar__error' : '',
                activeTab === String(item.id) ? 'v-btn--active' : '',
                isLive(item) ? '' : 'ml-2',
              ]"
              elevation="0"
              @click="switchTo(item)"
            >
              <Loader
                v-if="item.hasActionInProgress()"
                class="loader"
                :color="item.colorScheme"
                :size="20"
              />

              <v-icon
                v-if="tabState(item) === 'error'"
                class="mr-2"
                color="error"
                icon="$xcircle"
                :size="16"
              />
              {{ item.subinstanceLabel }}
            </AppButton>
          </template>

          <div
            v-if="!isLive(item)"
            class="px-4 py-4 text-center"
          >
            <template v-if="tabState(item) === 'in_progress'">
              <p class="p-4 mb-2">
                <i18next :translation="t('notification.instance.topBar.subInstance.inProgress.plain')">
                  <template #highlighted>
                    <strong>{{ t('notification.instance.topBar.subInstance.inProgress.highlighted') }}</strong>
                  </template>
                </i18next>
              </p>

              <!-- The clone cancel is not wired yet: the button renders without an action. -->
              <AppButton
                class="px-2"
                kind="danger"
                max-height="24px"
                size="x-small"
              >
                <span class="p-5">{{ t('button.cancelClone') }}</span>
              </AppButton>
            </template>

            <template v-else-if="tabState(item) === 'error'">
              <p class="p-4 mb-2">
                <i18next :translation="t('notification.instance.topBar.subInstance.error.plain')">
                  <template #highlighted>
                    <strong>{{ t('notification.instance.topBar.subInstance.error.highlighted') }}</strong>
                  </template>
                </i18next>
              </p>

              <!-- Try again and Cancel are not wired yet: both buttons render without an action. -->
              <div class="d-flex justify-center">
                <AppButton
                  class="px-2"
                  kind="primary"
                  max-height="24px"
                  size="x-small"
                >
                  <span class="p-5">{{ t('button.try') }}</span>
                </AppButton>

                <AppButton
                  class="ml-2 px-2"
                  kind="danger"
                  max-height="24px"
                  size="x-small"
                >
                  <span class="p-5">{{ t('button.cancel') }}</span>
                </AppButton>
              </div>
            </template>
          </div>
        </v-menu>

        <v-tooltip
          v-if="canAddStaging"
          location="bottom"
          :open-delay="150"
          transition="custom-tooltip"
        >
          <template #activator="{ props: activatorProps }">
            <div v-bind="activatorProps">
              <AppButton
                :aria-label="t('notification.topBar.subInstance.newStaging')"
                class="subinstance-bar__add"
                kind="icon"
                size="default"
                @click="requestStaging"
              >
                <v-icon
                  class="heading--text"
                  icon="$plus"
                  :size="16"
                />
              </AppButton>
            </div>
          </template>

          <span>{{ t('tooltip.topBar.subInstance.newStaging') }}</span>
        </v-tooltip>
      </template>

      <template v-else>
        <div class="subinstance-bar__skeleton-container">
          <v-skeleton-loader type="avatar" />

          <v-skeleton-loader
            class="g"
            type="header"
          />
        </div>
      </template>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // LIVE tab, staging tabs with their hover states, the add button.
  // The bar's skeleton is shown while the instance is fetched and no instance is loaded yet. A tab switch emits
  // `instance-changed` with the id; the frame moves the route (`use-instance-frame-events.ts`). Try again, Cancel and Cancel clone
  // have no action yet.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { barParent, barSubinstances, canSwitchTo, type TabState, tabState } from './subinstance-bar'

  const props = defineProps<{
    instance: InstanceResource | null
    fetching: boolean
  }>()

  const emit = defineEmits<{
    'action-button-staging': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const route = useRoute()

  /** The live instance of a staging copy, else the instance itself. */
  const parentInstance = computed<InstanceResource | null>(() => (props.instance ? barParent(props.instance) : null))

  /** Live first, then the staging copies. */
  const tabs = computed<InstanceResource[]>(() => {
    if (!props.instance) {
      return []
    }
    const parent = parentInstance.value
    const copies = barSubinstances(props.instance)
    return parent ? [parent, ...copies] : copies
  })

  const canAddStaging = computed(() => {
    const current = props.instance
    return current !== null && barSubinstances(current).length === 0 && current.hasCreateStagingPrivilege()
  })

  function requestStaging (): void {
    if (props.instance) {
      emit('action-button-staging', props.instance)
    }
  }

  /** The route id at mount, then the tab the user picked. */
  const activeTab = ref(String(route.params.id))

  function isLive (item: InstanceResource): boolean {
    return item.id === parentInstance.value?.id
  }

  /** A tab in progress or failed does nothing; any other tab asks the frame for its instance. */
  function switchTo (item: InstanceResource): void {
    const state: TabState = tabState(item)
    if (!canSwitchTo(state)) {
      return
    }
    activeTab.value = String(item.id)
    emitAppEvent('instance-changed', { id: item.id })
  }
</script>

<style lang="scss" scoped>
.subinstance-bar {
  width: 100%;
  // !important: legacy `.subinstance-bar` background must win over the `v-tabs`/`v-toolbar` surface of the host component.
  background-color: var(--v-primary-lighten4) !important;
  transition: background-color 0.3s ease;

  .loader {
    margin-left: -20px;
    margin-right: 4px;
  }

  &--info {
    background-color: var(--v-info-lighten4);
  }

  &--primary {
    background-color: var(--v-primary-lighten5);
  }

  &--fetching {
    background-color: var(--v-gray-lighten2);
  }

  // Named with `__item` as well: the `.subinstance-bar__item.v-btn` content block below has the same specificity and comes later, so
  // it would win over the error tab's `padding-left: 0` and colour.
  &__error {
    &.subinstance-bar__item.v-btn :deep(.v-btn__content) {
      padding-left: 0;
      color: var(--v-error-base);
    }
  }

  &__in-progress,
  &__error {
    &.v-btn :deep(.v-btn__content::before) {
      display: none;
    }
  }

  // V4 renders `.v-container` with 16px all round; legacy V2 `.container` is 12px on top and none at the bottom here.
  .v-container {
    padding-top: 12px;
    padding-bottom: 0;

    .subinstance-bar__add {
      max-height: 31px;
      max-width: 31px;
      margin-left: 8px;
      // The empty `+` button keeps the legacy 14px / 21px root type (its 16 px icon is already legacy). V4 `.v-btn` root gives 16px / 24px.
      font-size: 14px;
      line-height: 21px;
      // Legacy `+` button in light is `rgba(0, 0, 0, 0.54)` (V2 icon button text); dark stays on the theme colour.
      .v-theme--light & {
        color: var(--v-icon-btn-color);
      }
    }

    .subinstance-bar__item {
      border-radius: 6px 6px 0 0;
      background: var(--v-secondary-darken1);
      max-height: 31px;
      // !important: removes the V4 `.v-btn` transition, which has the same specificity as this rule in the dark theme.
      transition: none !important;
      // Legacy tab root type is 14px / 21px; V4 `.v-btn` root gives 16px / 24px (as `.subinstance-bar__add` below).
      font-size: 14px;
      line-height: 21px;

      &::before {
        display: none;
      }

      &.v-btn--active {
        background: var(--v-body-base);
        // !important: as above, for the active tab.
        transition: none !important;

        // V4 paints the active-state overlay (12% black) on the tab; V2 had no overlay here.
        // `:deep`: the overlay is rendered inside `v-btn`, which the scoped attribute does not reach.
        :deep(.v-btn__overlay) {
          display: none;
        }
      }

      + .subinstance-bar__item {
        margin-left: 8px;
      }
    }
  }

  &__skeleton-container {
    height: 31px;
    width: 98px;
    display: flex;
    align-items: center;
    padding: 13px 16px;
    background-color: var(--v-body-base);
    border-radius: 6px 6px 0 0;

    // V4 roots paint the surface colour (V2 transparent), pin the avatar to 48px (`min-*` / `max-*`) with `8px 16px` margins, and
    // let bones take a full row (`flex: 1 1 100%`); the legacy 8px dot and 48px bar sit on one line.
    .v-skeleton-loader {
      background: transparent;
      flex-wrap: nowrap;
    }

    :deep(.v-skeleton-loader__avatar) {
      width: 8px;
      height: 8px;
      min-width: 8px;
      min-height: 8px;
      max-width: 8px;
      max-height: 8px;
      margin: 0;
    }

    :deep(.v-skeleton-loader__header) {
      flex: 0 0 auto;
      height: 8px;
      width: 48px;
      border-radius: 3px;
      margin: 0 0 0 10px;
    }
  }
}

.subinstance-bar__item.v-btn :deep(.v-btn__content) {
  padding-left: 18px;
  color: var(--v-text-darken2);
  font-size: 14px;
  // No tracking: the legacy tab is a constant 4.02px wider than the bare label at both widths (live and staging), a space after the
  // label (the `::after` below), not letter spacing (a per-letter value fits one label and misses the other).
  letter-spacing: 0;
  line-height: 20px;
  position: relative;
  font-weight: 700;

  &::before {
    content: '';
    height: 8px;
    width: 8px;
    position: absolute;
    background: rgb(var(--v-theme-primary));
    left: 0;
    top: calc(50% - 4px);
    border-radius: 50%;
  }

  // Legacy keeps the whitespace after the label in the tab (V2 `.v-btn__content`), 4.02px at 14px / 700 (measured as the constant
  // width gap of the live and staging tabs). V4 collapses it; a template `{{ ' ' }}` or `&nbsp;` at the end is not that width
  // (`&nbsp;` measured 8px), so the width is stated.
  &::after {
    content: '';
    flex: 0 0 auto;
    width: 4.02px;
  }
}

.subinstance-bar__item--primary.v-btn :deep(.v-btn__content::before) {
  background: var(--v-success-base);
}

.subinstance-bar__item--info.v-btn :deep(.v-btn__content::before) {
  background: var(--v-info-base);
}
</style>
