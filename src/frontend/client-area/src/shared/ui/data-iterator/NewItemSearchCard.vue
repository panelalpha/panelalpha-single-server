<template>
  <v-card
    class="w-100 d-flex pa-6"
    elevation="4"
  >
    <v-text-field
      ref="input"
      class="full-width-input w-100"
      hide-details
      :model-value="text"
      :placeholder="placeholder"
      prepend-inner-icon=""
      variant="outlined"
      @update:model-value="debounceSearchInput"
    >
      <template #prepend-inner>
        <v-icon
          icon="$search"
          size="20"
        />
      </template>
    </v-text-field>

    <div class="d-flex flex-wrap align-center justify-start mt-2">
      <span class="text-gray-lighten-1 p-5 mr-2 mt-2">{{ tagsLabel }}</span>

      <v-chip
        v-for="(tag, index) in tags"
        :key="`${tag.value}-${index}`"
        class="mr-2 mt-2 new-item-search-tag"
        color="gray-lighten-4"
        size="small"
        variant="flat"
        @click="pickTag(tag.value)"
      >
        <span class="text-gray-darken-2">{{ tag.label }}</span>
      </v-chip>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  // Used by Plugins and Themes. The legacy
  // autofocus looked the input up with a global `document.querySelector('.focus-input input')`; here the field is a template ref.
  // The title and the placeholder come from the host (its i18n keys), the card has no translations of its own.
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

  export interface NewItemSearchTag {
    label: string
    value: string
  }

  const props = withDefaults(defineProps<{
    /** The search term as the host keeps it (legacy `item.searchTerm`). */
    modelValue: string
    tags: NewItemSearchTag[]
    placeholder?: string
    tagsLabel?: string
    /** Legacy `isActive`: focusing the field again when the host shows the card. */
    isActive?: boolean
  }>(), {
    placeholder: '',
    tagsLabel: '',
    isActive: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: string]
    'search': [value: string]
  }>()

  const input = ref<{ focus: () => void } | null>(null)
  // The field shows what the user typed at once; the host gets the term 300 ms after the last key (legacy `_.debounce(..., 300)`).
  const text = ref('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let focusTimer: ReturnType<typeof setTimeout> | undefined

  watch(() => props.modelValue, value => {
    text.value = value
  }, { immediate: true })

  // Legacy `focusOnInput` (200 ms after mount and after `isActive` turns on).
  function focusLater (): void {
    clearTimeout(focusTimer)
    focusTimer = setTimeout(() => {
      input.value?.focus()
    }, 200)
  }

  function debounceSearchInput (value: string | null): void {
    text.value = value ?? ''
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      emit('update:model-value', text.value)
    }, 300)
  }

  // A tag is a search at once (legacy `$emit('update:searchTerm', item)` on the chip, no debounce). A pending typed term is dropped.
  function pickTag (value: string): void {
    clearTimeout(debounceTimer)
    text.value = value
    emit('search', value)
  }

  watch(() => props.isActive, value => {
    if (value) {
      focusLater()
    }
  })

  onMounted(focusLater)

  onBeforeUnmount(() => {
    clearTimeout(debounceTimer)
    clearTimeout(focusTimer)
  })
</script>

<style lang="scss" scoped>
// Legacy `.v-chip.v-size--small` of the card: the small chips keep their 10px label. `variant="flat"`: V2 filled the chip with the
// full `gray lighten-4`, the V4 default (`tonal`) paints only a 12% wash of it, which read as too light.
.new-item-search-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 4px;
  border-radius: 5px;
}
</style>
