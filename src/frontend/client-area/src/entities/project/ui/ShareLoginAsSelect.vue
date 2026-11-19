<template>
  <select-dropdown
    :key="selectKey"
    :aria-label="t('form.label.loginAs')"
    block
    class="share-login-as"
    :disabled="disabled"
    :item-text="'text'"
    :item-value="'key'"
    :items="items"
    :loading="loading"
    :model-value="value"
    :placeholder="t('form.label.loginAs')"
    raw-item-text
    :return-object="false"
    @update:model-value="onChange"
  />
</template>

<script lang="ts" setup>
  // The "Log in as" picker of the share dialogs: the WordPress user an SSO role opens the site as, or all users
  // (`ALL_WORDPRESS_USERS_KEY`). One component for the invite form and the table rows (the legacy dialogs
  // each had a copy). The value is the WordPress user id, `null` for all users; `aria-label` is new.
  import type { WordpressUserDropdownItem } from './share-instance'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import { ALL_WORDPRESS_USERS_KEY, wordpressUserIdOf } from './share-instance'

  const props = withDefaults(defineProps<{
    items: WordpressUserDropdownItem[]
    modelValue: number | null | undefined
    loading?: boolean
    disabled?: boolean
  }>(), {
    loading: false,
    disabled: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: number | null]
  }>()

  const { t } = useTranslation()

  const value = computed(() => {
    const id = Number(props.modelValue ?? ALL_WORDPRESS_USERS_KEY)
    return Number.isNaN(id) ? ALL_WORDPRESS_USERS_KEY : id
  })

  // A new list (the WordPress users loaded) remounts the select, so it shows the label of the chosen id.
  const selectKey = computed(() => `login-as-${props.loading ? 'loading' : 'ready'}-${props.items.length}`)

  function onChange (next: unknown): void {
    emit('update:model-value', wordpressUserIdOf(next))
  }
</script>
