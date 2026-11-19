<template>
  <nav
    ref="root"
    :aria-label="localeText('$vuetify.pagination.ariaLabel.root')"
    class="v-pagination"
    data-testid="v-pagination-root"
    role="navigation"
    @keydown="onKeydown"
  >
    <ul class="v-pagination__list">
      <li
        class="v-pagination__prev"
        data-testid="v-pagination-prev"
      >
        <AppButton
          :aria-label="localeText('$vuetify.pagination.ariaLabel.previous')"
          :disabled="page <= 1"
          :icon="prevIcon"
          variant="text"
          @click="select($event, page - 1)"
        />
      </li>

      <template
        v-for="(item, index) in items"
        :key="item === '...' ? `more-${index}` : item"
      >
        <li
          v-if="item === '...'"
          data-testid="v-pagination-more"
        >
          <span class="v-pagination__more">...</span>
        </li>

        <li
          v-else
          class="v-pagination__item"
          :class="{ 'v-pagination__item--is-active': item === page }"
          data-testid="v-pagination-item"
        >
          <AppButton
            :aria-current="item === page"
            :aria-label="localeText(item === page ? '$vuetify.pagination.ariaLabel.currentPage' : '$vuetify.pagination.ariaLabel.page', item)"
            :color="item === page ? 'primary' : undefined"
            :data-page="item"
            :variant="item === page ? 'flat' : 'text'"
            @click="select($event, item)"
          >
            {{ item }}
          </AppButton>
        </li>
      </template>

      <li
        class="v-pagination__next"
        data-testid="v-pagination-next"
      >
        <AppButton
          :aria-label="localeText('$vuetify.pagination.ariaLabel.next')"
          :disabled="page >= length"
          :icon="nextIcon"
          variant="text"
          @click="select($event, page + 1)"
        />
      </li>
    </ul>
  </nav>
</template>

<script lang="ts" setup>
  // The pagination of `DataIteratorFooter`: the page list of Vuetify 2 `VPagination` (`pagination-items.ts`) on the kit buttons, with the
  // classes and the ARIA of V4 `v-pagination` (so the global `_pagination.scss` still reaches it). How many items fit is read from the
  // width of the parent, like V2 `onResize` (`maxButtons`).
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useLocale } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { paginationItems, paginationMaxButtons } from './pagination-items'

  const props = withDefaults(defineProps<{
    length: number
    totalVisible?: number
    prevIcon?: string
    nextIcon?: string
  }>(), {
    totalVisible: 9,
    prevIcon: '$paginationleft',
    nextIcon: '$paginationright',
  })

  const page = defineModel<number>({ default: 1 })

  const { t } = useLocale()
  const root = ref<HTMLElement>()
  const maxButtons = ref(0)

  // `t` of the Vuetify locale takes the page number as a format argument.
  function localeText (key: string, ...args: unknown[]): string {
    return t(key, ...args)
  }

  const items = computed(() => paginationItems({ length: props.length, value: page.value, totalVisible: props.totalVisible, maxButtons: maxButtons.value }))

  function measure (): void {
    const parent = root.value?.parentElement
    maxButtons.value = paginationMaxButtons(parent ? parent.clientWidth : window.innerWidth)
  }

  function select (event: Event, target: number): void {
    event.preventDefault()
    page.value = target
  }

  // V4 `v-pagination` keyboard: Left and Right change the page and keep the focus on the current page button.
  function onKeydown (event: KeyboardEvent): void {
    const step = event.key === 'ArrowLeft' ? -1 : (event.key === 'ArrowRight' ? 1 : 0)
    const target = page.value + step
    if (step === 0 || target < 1 || target > props.length) {
      return
    }
    page.value = target
    void nextTick(() => {
      root.value?.querySelector<HTMLElement>('.v-pagination__item--is-active button')?.focus()
    })
  }

  let observer: ResizeObserver | undefined

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined' && root.value?.parentElement) {
      observer = new ResizeObserver(measure)
      observer.observe(root.value.parentElement)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
  })
</script>
