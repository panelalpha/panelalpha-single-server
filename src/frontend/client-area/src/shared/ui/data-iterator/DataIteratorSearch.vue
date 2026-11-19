<template>
  <div>
    <template v-if="smAndDown && fullWidthSearch">
      <div
        v-click-outside="closeInput"
        @click="openInput"
      >
        <v-text-field
          ref="input"
          :aria-label="ariaLabel"
          class="full-width-input"
          :class="open ? 'full-width-input--open' : ''"
          hide-details
          :model-value="text"
          :placeholder="placeholder ?? t('form.placeholder.search')"
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
      </div>
    </template>

    <template v-else>
      <!-- V4 renders the native input with `size="1"`; V2 left the default 20, which sized the field in a shrink-to-fit toolbar. -->
      <v-text-field
        :aria-label="ariaLabel"
        hide-details
        :model-value="text"
        :placeholder="placeholder ?? t('form.placeholder.search')"
        prepend-inner-icon=""
        size="20"
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
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { ClickOutside } from 'vuetify/directives'

  const props = withDefaults(defineProps<{
    fullWidthSearch?: boolean
    ariaLabel?: string
    /** The field's hint; the generic "Search" without it. */
    placeholder?: string
    /** When it changes, a pending (debounced) emit is dropped and the field shows the model again, also if the model is the same. */
    resetKey?: string | number
  }>(), {
    fullWidthSearch: false,
    ariaLabel: undefined,
    placeholder: undefined,
    resetKey: undefined,
  })

  // Legacy `searchTermData` prop + `update:searchTermData` emit.
  const model = defineModel<string>({ default: '' })

  const vClickOutside = ClickOutside
  const { t } = useTranslation()
  const { smAndDown } = useDisplay()

  const open = ref(false)
  const input = ref<{ focus: () => void } | null>(null)
  // The field shows what the user typed at once; the model follows 300 ms later.
  const text = ref(model.value)
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(model, value => {
    text.value = value
  })

  watch(() => props.resetKey, () => {
    clearTimeout(timer)
    text.value = model.value
  })

  // Per-instance 300 ms trailing debounce (legacy `_.debounce(..., 300)`).
  function debounceSearchInput (value: string | null): void {
    text.value = value ?? ''
    clearTimeout(timer)
    timer = setTimeout(() => {
      model.value = text.value
    }, 300)
  }

  function openInput (): void {
    open.value = true
    nextTick(() => {
      input.value?.focus()
    })
  }

  function closeInput (): void {
    open.value = false
  }

  onBeforeUnmount(() => {
    clearTimeout(timer)
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.v-input {
  @media (max-width: map.get(v.$grid-breakpoints, sm)) {
    :deep(.v-input__control) {
      min-height: 38px;
      height: 38px;
    }

    // V2 `.v-text-field__slot, .v-input__slot` is the V4 `.v-field`. The V2 `fieldset { height: 42px }` is
    // omitted: the V4 `.v-field__outline` always fills the field. Same selector as the global 48px `min-height` so this one can win.
    :deep(.v-input__control .v-field) {
      min-height: 38px;
      height: 38px;
    }
  }
}

.full-width-input.v-input {
  transition: width 0.3s ease;

  &:not(.full-width-input--open) {
    :deep(.v-field__outline) {
      color: transparent;
    }
  }

  :deep(.v-input__control) {
    min-height: 38px;
    height: 38px;
    width: 38px;
  }

  :deep(.v-field) {
    min-height: 38px;
    height: 38px;
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  // V2 `.v-text-field__slot` (the input box) is the V4 `.v-field__field`.
  :deep(.v-field__field) {
    display: none;
    transition: max-width 0.3s ease;
  }

  :deep(.v-field__prepend-inner) {
    padding-right: 0px;
  }

  &.full-width-input--open {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: var(--v-white-base);

    // V2 `.v-input__control` stayed 38px but its slot overflowed it; the V4 `.v-field__field` would be 0px wide inside it.
    :deep(.v-input__control) {
      width: 100%;
    }

    :deep(.v-field__field) {
      display: flex;
    }

    :deep(.v-field__prepend-inner) {
      padding-right: 4px;
    }
  }
}
</style>
