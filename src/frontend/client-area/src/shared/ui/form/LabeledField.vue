<template>
  <div class="labeled-field">
    <label
      class="labeled-field__label base--text p-3"
      v-bind="labelTestid ? { 'data-testid': labelTestid } : {}"
    >{{ label }}<template v-if="$slots['label-append']">{{ ' ' }}<slot name="label-append" /></template></label>

    <slot />
  </div>
</template>

<script lang="ts" setup>
  // Label above a form control: settings, account, services and reseller forms. One look for every consumer: the label in
  // `base--text p-3` on its own line, 10px above the control. The control (text field, select, switch, dropdown, skeleton) is the default slot;
  // `label-append` holds an icon after the text (2FA code help). As before the pattern, the label has no `for`: the controls keep their own
  // accessible names (`aria-label`, placeholder or Vuetify label).
  defineProps<{
    label: string
    labelTestid?: string
  }>()
</script>

<style lang="scss" scoped>
.labeled-field__label {
  display: block;
  margin-bottom: 10px;
}
</style>
