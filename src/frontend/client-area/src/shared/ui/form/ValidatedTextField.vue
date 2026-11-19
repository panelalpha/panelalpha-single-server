<template>
  <v-text-field
    ref="field"
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
  import { useTemplateRef } from 'vue'
  import { useHideErrorWhileFocused, type ValidatedFieldHandle } from './use-hide-error-while-focused'

  // A `v-text-field` with `validate-on="blur"` that behaves like V2 `validate-on-blur`: the message goes away at the focus and while the user
  // types, and comes back at the next blur. It declares no props: every attribute,
  // `v-model`, `rules`, `validate-on` and listener falls through to the `v-text-field`, so a consumer swaps the tag and nothing else.
  const field = useTemplateRef<ValidatedFieldHandle>('field')
  const { onFocusedChange } = useHideErrorWhileFocused(field)
</script>
