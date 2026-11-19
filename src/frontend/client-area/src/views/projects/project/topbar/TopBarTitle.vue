<template>
  <div
    class="d-flex align-center top-bar-title"
    :class="{ 'top-bar-title--full': mdAndDown }"
  >
    <router-link
      v-if="!mdAndDown"
      :aria-label="t(labels.back)"
      class="mr-6 back-button"
      to="/"
    >
      <v-icon
        class="heading--text"
        icon="$arrowleft"
        size="24"
      />
    </router-link>

    <div class="d-flex w-100">
      <div class="top-bar-title__container">
        <template v-if="!fetching">
          <strong
            v-if="!instance.isActive"
            class="error--text"
          >{{ t('message.status.instance.notActive') }}</strong>

          <v-menu
            :close-on-content-click="false"
            content-class="instance-search-menu disable-scroll"
            location="bottom"
            max-width="calc(100vw - 48px)"
            min-width="200px"
            :offset="mdAndDown ? 6 : 4"
            transition="slide-y-transition"
            @update:model-value="onMenuToggle"
          >
            <template #activator="{ props: activatorProps }">
              <TopBarEditableTitle
                :activator-props="activatorProps"
                :instance="instance"
              />
            </template>

            <v-text-field
              ref="searchTextField"
              class="instance-search-menu__field"
              hide-details="auto"
              :placeholder="t('form.placeholder.searchInstance')"
              prepend-inner-icon="$search"
              variant="underlined"
              @update:model-value="onSearchInput"
            />

            <div
              v-if="!searchError && searchResults.length > 0"
              class="instance-search-menu__list"
            >
              <InstanceSearchItem
                v-for="item in searchResults"
                :key="item.id"
                :instance="item"
              />
            </div>

            <div v-else-if="searchResults.length === 0 && !searchError">
              <InstanceSearchItemSkeleton
                v-for="n in 3"
                :key="n"
              />
            </div>

            <p
              v-else
              class="instance-search-menu__list text-center p-2 mt-4"
            >
              {{ t('message.instance.notFound', { searchField }) }}
            </p>
          </v-menu>

          <div
            class="top-bar-title__box d-flex flex-wrap align-center"
            :class="lg ? 'mb-6' : ''"
          >
            <div class="d-flex align-center mr-4 mt-4 instance-domain-group">
              <a
                class="p-3 instance-domain-link"
                data-testid="instance-url"
                :href="instance.url"
                rel="noopener noreferrer"
                target="_blank"
                :title="instance.url"
              >{{ instance.url }}</a>

              <CopyTextButton
                :aria-label="t('button.copyUrl')"
                class="flex-shrink-0"
                :text="instance.url"
              />
            </div>

            <SetYourDomainModal
              :key="instance.id"
              class="mt-4 flex-shrink-0"
              :instance="instance"
              @dns-propagation-in-progress="emit('dns-propagation-in-progress')"
              @instance-published="emit('instance-published', $event)"
            />

            <div
              ref="labelContainer"
              class="labelContainer mt-4 flex-shrink-0"
            >
              <InstanceLabels
                chips
                :filters-active="true"
                :instance="instance"
                :labels="instance.labels"
                :max-labels-displayed="2"
                :max-width="maxLabelWidth"
                remaining-as-button
                :removable="false"
              />
            </div>
          </div>
        </template>

        <div
          v-else
          class="d-flex skeleton-loader flex-column"
        >
          <v-skeleton-loader
            class="header"
            type="header"
          />

          <v-skeleton-loader
            class="subheader"
            type="text, chip@2"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The URL row with `CopyTextButton` and the ellipsis, with the title and search menu.
  // The label filter comes later; the SetYourDomain trigger, its modal and the
  // DNS check are in `SetYourDomainModal.vue` (embedded here, as legacy).
  import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import InstanceLabels from '@/entities/label/ui/InstanceLabels.vue'
  import { preferredSpaBaseLabels } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import { fetchInstanceSearch, SEARCH_DEBOUNCE_MS } from './instance-search'
  import InstanceSearchItem from './InstanceSearchItem.vue'
  import InstanceSearchItemSkeleton from './InstanceSearchItemSkeleton.vue'
  import SetYourDomainModal from './SetYourDomainModal.vue'
  import TopBarEditableTitle from './TopBarEditableTitle.vue'

  const props = defineProps<{
    instance: InstanceResource
    fetching: boolean
  }>()

  const emit = defineEmits<{
    'dns-propagation-in-progress': []
    'instance-published': [instance: RawInstance]
  }>()

  const { t } = useTranslation()
  const { lg, mdAndDown } = useDisplay()
  const session = useSessionStore()
  const labels = computed(() => preferredSpaBaseLabels(session.home))

  const labelContainer = ref<HTMLElement | null>(null)
  const maxLabelWidth = ref(0)

  /** The debounced term, `searchResults`, `searchError` and the field ref for focus. */
  const searchField = ref('')
  const searchResults = ref<InstanceResource[]>([])
  const searchError = ref(false)
  const searchTextField = ref<{ focus: () => void } | null>(null)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let focusTimer: ReturnType<typeof setTimeout> | undefined

  /** A failure or an empty list is "not found"; the previous results stay as they were. */
  async function checkSearchResults (term = searchField.value): Promise<void> {
    const outcome = await fetchInstanceSearch(term, session.home)
    searchError.value = outcome.error
    if (!outcome.error) {
      searchResults.value = outcome.items
    }
  }

  /** The term is applied 300 ms after the last keystroke. */
  function onSearchInput (value: string | null): void {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      searchField.value = value ?? ''
    }, SEARCH_DEBOUNCE_MS)
  }

  watch(searchField, value => {
    void checkSearchResults(value)
  })

  /** On the title click: on open the field gets focus and the list is loaded if empty. */
  function onMenuToggle (open: boolean): void {
    if (!open) {
      return
    }
    if (searchResults.value.length === 0) {
      void checkSearchResults()
    }
    clearTimeout(focusTimer)
    focusTimer = setTimeout(() => {
      searchTextField.value?.focus()
    }, 100)
  }

  /** The labels wrap inside the width of their container. */
  function measureLabelContainer (): void {
    void nextTick(() => {
      if (labelContainer.value) {
        maxLabelWidth.value = labelContainer.value.offsetWidth
      }
    })
  }

  onMounted(() => {
    measureLabelContainer()
    window.addEventListener('resize', measureLabelContainer)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', measureLabelContainer)
    clearTimeout(debounceTimer)
    clearTimeout(focusTimer)
  })

  watch(() => props.fetching, measureLabelContainer)
  watch(() => props.instance.id, measureLabelContainer)
</script>

<style lang="scss" scoped>
// The back button arrow is grey and turns primary on hover.
.back-button {
  .v-icon {
    color: var(--v-back-icon-color);
  }

  &:hover .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.labelContainer {
  width: auto;
  white-space: nowrap;
}

.instance-domain-group {
  // Keep a usable truncated URL; let DNS badge / tags wrap instead of crushing the link down to a few pixels.
  min-width: min(100%, 160px);
  max-width: min(100%, 240px);
  flex: 0 0 auto;
}

.instance-domain-link {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-bar-title {
  // Allow the title column to shrink so the action buttons stay on the same row instead of wrapping below a long URL.
  width: auto;
  max-width: 100%;
  min-width: 0;

  .top-bar-title__container {
    width: 100%;
  }

  .top-bar-title__box {
    margin-top: -16px;
  }
}

@media (max-width: 975.98px) {
  .top-bar-title {
    width: 100%;
    max-width: calc(100% - 92px);
    flex-direction: column;
    // !important: wins over Vuetify `.align-center` utility (already !important) on the same element; no other way to override it.
    align-items: flex-start !important;

    > div {
      max-width: 100%;
    }

  }
}

// Replaces the legacy inline `max-width: 100%` (mdAndDown): it must beat the media-query `calc(100% - 92px)` above.
.top-bar-title.top-bar-title--full {
  max-width: 100%;
}

// The search menu (`.instance-search-menu`, `.instance-search-menu__list`): the list is 473px wide and scrolls.
.instance-search-menu {
  overflow: scroll;

  // 473px as legacy, but never wider than the menu, which is capped at `100vw - 48px` on a narrow window.
  .instance-search-menu__list {
    overflow-y: overlay;
    display: flex;
    flex-direction: column;
    max-height: 241px;
    width: 473px;
    max-width: 100%;
  }
}

// Legacy `.v-menu__content .v-input` rules for the search field: the 62px field. The V4 field is `.v-field`.
.instance-search-menu__field {
  margin-top: 0;
  padding-top: 0;
  display: flex;
  align-items: center;

  // The flex root above keeps the V2 row. V2 `.v-input__slot` grew to the menu width; V4 `.v-input__control` would stay at its
  // content width (the 21 px field), so it takes the free space.
  :deep(.v-input__control) {
    flex: 1 1 auto;
    min-width: 0;
  }

  // The global legacy `.v-input__control .v-field` (48px) outranks a bare `.v-field`, so the control is named as well.
  :deep(.v-input__control .v-field) {
    min-height: 62px;
  }

  // The flex root also lays out the V4 details row (`hide-details="auto"` still renders it, empty) as a 13px column beside the control.
  :deep(.v-input__details) {
    display: none;
  }

  // V4 pads the native input 6px on both sides next to a prepended icon; legacy's input box is bare (57px from the menu edge to its
  // left side, to the menu's right edge on the other).
  :deep(.v-field__input) {
    padding-inline: 0;
  }

  :deep(.v-field__prepend-inner) {
    margin-top: 0;
    align-self: center;
    margin-right: 7px;
    margin-left: 16px;
  }
}

</style>
