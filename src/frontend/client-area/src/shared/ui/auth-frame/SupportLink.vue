<template>
  <p>
    {{ t('message.support.before') }}
    <a
      class="text-info"
      :href="href ?? undefined"
    >{{ t('message.support.link') }}</a>
    {{ t('message.support.after') }}
  </p>
</template>

<script lang="ts" setup>
  // Support sentence under a session-screen error: Login, Register, Accept Invite.
  // The `v-if` on the support link stays with the screen.
  import { useTranslation } from 'i18next-vue'

  withDefaults(defineProps<{
    href?: string | null
  }>(), {
    href: null,
  })

  const { t } = useTranslation()
</script>
