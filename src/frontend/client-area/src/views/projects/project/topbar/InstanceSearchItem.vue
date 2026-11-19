<template>
  <router-link
    class="d-flex search-item"
    :to="spaPath(`${instance.id}/general`)"
  >
    <InstanceAvatar
      :instance="instance"
      :size="40"
    />

    <div class="d-flex flex-column search-item__content">
      <!-- Vue 2 condensed the padding whitespace of `<h6>\n {{ title }}\n </h6>` to one space; Vue 3 trims it, so it is restated. -->
      <h6>
        {{ instance.title }}{{ ' ' }}
      </h6>

      <div class="d-flex">
        <a
          class="instance-domain-link p-3"
          :href="instance.url"
        >
          {{ instance.url }}
        </a>

        <LabelsList
          dots
          :labels="instance.labels"
          :max-labels-displayed="2"
        />
      </div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
  // `spaPath` gives the same path as the legacy `$spaResourcePath('<id>/general')`, the single-server rewrite included.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import LabelsList from '@/entities/label/ui/LabelsList.vue'
  import InstanceAvatar from '@/entities/project/ui/InstanceAvatar.vue'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'

  defineProps<{
    instance: InstanceResource
  }>()

  const { spaPath } = useSpaResourcePath()
</script>

<style lang="scss" scoped>
// The tooltip background and the primary lightening are the V4 theme variables.
.search-item {
  padding: 16px;
  transition: background-color 0.3s ease;
  background-color: var(--v-tooltip-base);
  // The row is an `a`: the UA link colour (`rgb(0, 0, 238)`) is not the theme anchor colour of legacy.
  color: var(--v-anchor-base);

  &:hover {
    background-color: var(--v-primary-lighten5);
  }

  a {
    // `map-get($gray, darken1)` in legacy: a static colour, not themed.
    color: var(--v-gray-darken1-static);
  }

  // The menu content is capped at `100vw - 48px` (`max-width` of the menu), so a long title or domain has to wrap inside the row
  // instead of running past the menu.
  &__content {
    margin-left: 16px;
    min-width: 0;

    h6,
    .instance-domain-link {
      overflow-wrap: anywhere;
    }
  }
}
</style>
