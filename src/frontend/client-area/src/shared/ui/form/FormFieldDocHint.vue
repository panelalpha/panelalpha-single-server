<template>
  <div class="form-field-doc-hint caption">
    <span
      v-if="hint"
      class="text-gray-darken-1"
    >{{ hint }}</span>

    <a
      v-if="shouldShowDocLink"
      class="text-info"
      :class="{ 'ml-1': hint }"
      :href="documentationLink"
      rel="noopener"
      target="_blank"
    >{{ linkText }}</a>
  </div>
</template>

<script lang="ts" setup>
  // The host passes the documentation link, as `DnsOptions` does
  // (`store.state.home.app.documentation_link`): the kit does not read the session.
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    hint?: string
    linkText: string
    showDocLink?: boolean
    documentationLink?: string
  }>(), {
    hint: '',
    showDocLink: true,
    documentationLink: '',
  })

  const shouldShowDocLink = computed(() => props.showDocLink && !!props.documentationLink)
</script>
