<template>
  <footer data-testid="shell-footer">
    <div class="px-6">
      <v-container class="px-1">
        <div class="d-flex justify-end align-center">
          <LanguageSwitcher @language-changed="emit('language-changed')" />
        </div>
      </v-container>
    </div>
  </footer>
</template>

<script lang="ts" setup>
  import LanguageSwitcher from '@/shared/ui/language/LanguageSwitcher.vue'

  // The footer relays the switcher's `languageChanged` (remount of the whole `v-app`).
  const emit = defineEmits<{ 'language-changed': [] }>()
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px (the sides come from `px-1`); V4 `.v-container` is 16px.
.v-container {
  padding-block: 12px;
}
</style>
