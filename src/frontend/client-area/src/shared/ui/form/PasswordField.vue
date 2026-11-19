<template>
  <v-text-field
    ref="field"
    v-bind="defaults"
    @update:focused="onFocusedChange"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps ?? {}"
      />
    </template>
  </v-text-field>
</template>

<script lang="ts" setup>
  import { computed, useAttrs, useTemplateRef } from 'vue'
  import { formFieldDefaults } from './form-field'
  import { useHideErrorWhileFocused, type ValidatedFieldHandle } from './use-hide-error-while-focused'

  // The password field of the session screens: login, register, reset password and accept invite, one look (lock icon,
  // outlined, single line, validated on blur, messages only when there are some). It declares no props: `v-model`, `label`, `name`,
  // `autocomplete`, `rules`, `data-testid` and listeners fall through to the `v-text-field`, so autofill, validation and Enter work as on a bare field.
  const attrs = useAttrs()
  const defaults = computed(() => formFieldDefaults('password', Object.keys(attrs)))
  // Legacy shows the message only while the field has no focus.
  const field = useTemplateRef<ValidatedFieldHandle>('field')
  const { onFocusedChange } = useHideErrorWhileFocused(field)
</script>
