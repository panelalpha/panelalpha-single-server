<template>
  <v-row
    v-if="visible"
    align="center"
    class="data-iterator-footer my-3 mx-4"
    justify="center"
  >
    <DataIteratorPagination
      v-model="page"
      :length="numberOfPages ? numberOfPages : 1"
    />

    <v-spacer v-if="showSizes" />

    <div
      v-if="showSizes"
      class="data-iterator-page-number"
    >
      <span>{{ perPageLabel || t('table.footer.record') }}</span>

      <AppButton
        v-for="(item, index) in possibleItemsPerPage[listStyle]"
        :key="index"
        :class="pageNumberIsActive(item) ? 'active' : ''"
        elevation="0"
        @click="updateItemsPerPage(item)"
      >
        <!-- V2 kept a space on both sides of a multi-line label (`white-space: break-spaces`), Vue 3 trims it: legacy buttons are 8.8px wider. -->
        {{ ` ${item} ` }}
      </AppButton>
    </div>
  </v-row>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorPagination from './DataIteratorPagination.vue'

  const props = withDefaults(defineProps<{
    numberOfPages?: number
    possibleItemsPerPage: Array<Array<number | string>>
    itemsPerPage?: number
    listStyle?: number
    perPageLabel?: string
    // Size that counts as "not changed by the user" (the footer hides for it at one page); without it the first per-page option.
    defaultItemsPerPage?: number
  }>(), {
    numberOfPages: undefined,
    itemsPerPage: undefined,
    listStyle: 0,
    perPageLabel: '',
    defaultItemsPerPage: undefined,
  })

  const emit = defineEmits<{
    'update:items-per-page': [value: number | string]
  }>()

  // Legacy `page` prop + `update:page` emit.
  const page = defineModel<number>('page', { default: 1 })

  const { t } = useTranslation()
  const { mobile } = useDisplay()

  // One rule for every table: the footer shows with more than one page, or when the size
  // differs from the default (so a user who picked a bigger size can go back). One page at the default size: no footer.
  // No sizes to offer (a table paged by the API, where a page is a window of a file): no per-page label either.
  const showSizes = computed(() => !mobile.value && (props.possibleItemsPerPage[props.listStyle]?.length ?? 0) > 0)

  const visible = computed(() => {
    if (props.numberOfPages === undefined) return true
    const fallback = props.possibleItemsPerPage[props.listStyle]?.[0]
    return props.numberOfPages > 1 || props.itemsPerPage !== (props.defaultItemsPerPage ?? fallback)
  })

  // Legacy maps the literal "all" option to 99; any other string (e.g. a translated "All") passes through.
  function toCount (target: number | string): number | string {
    return target === 'all' ? 99 : target
  }

  function updateItemsPerPage (target: number | string): void {
    emit('update:items-per-page', toCount(target))
  }

  function pageNumberIsActive (target: number | string): boolean {
    return props.itemsPerPage === toCount(target)
  }
</script>

<style
  lang="scss"
  scoped
  src="./DataIteratorFooter.scss"
/>
