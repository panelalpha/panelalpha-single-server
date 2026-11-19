<template>
  <CatalogCard
    :description="description.text"
    :featured-label="featured ? t('general.featured') : undefined"
    :install-aria-label="installAriaLabel"
    :install-busy="inProgress"
    :install-tooltip="t('button.plugin.install')"
    :installs="item.active_installs || undefined"
    :rating="item.rating || undefined"
    :read-more="description.hasReadMore"
    :read-more-label="t('button.readMore')"
    :title="title"
    @install="emit('action-button-install', item)"
    @read-more="emit('action-button-read-more', item)"
  >
    <template #title-append>
      <v-tooltip
        v-if="featured"
        location="bottom"
        :offset="8"
        transition="custom-tooltip"
        z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <v-icon
            class="ml-2 primary-on-hover"
            color="gray-lighten-1"
            icon="$alertcircle"
            size="16"
            v-bind="activatorProps"
          />
        </template>

        <span class="base--text">{{ t('message.status.plugin.special') }}</span>
      </v-tooltip>
    </template>
  </CatalogCard>
</template>

<script lang="ts" setup>
  // On the catalogue card of the kit.
  // The card maps the catalogue plugin to the card props; the special icon of a featured plugin is its own (`#title-append`).
  // An entry with an install or update in progress shows the loader instead of the install icon.
  import type { RepositoryPlugin } from '@/entities/project/instance-plugins.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import CatalogCard from '@/entities/project/ui/catalog/CatalogCard.vue'
  import { cardDescription, itemAsyncState } from '@/entities/project/wordpress-items'
  import { decodeEntities } from '@/shared/format/decode-entities'

  const props = withDefaults(defineProps<{
    item: RepositoryPlugin
    /** The ribbon and the special icon of the first list (featured, not searched). */
    featured?: boolean
  }>(), {
    featured: false,
  })

  const emit = defineEmits<{
    'action-button-install': [item: RepositoryPlugin]
    'action-button-read-more': [item: RepositoryPlugin]
  }>()

  const { t } = useTranslation()

  // The catalogue cut of the short description or the description, the same as the installed card.
  const description = computed(() => cardDescription(props.item.short_description || props.item.description || ''))

  const title = computed(() => decodeEntities(props.item.name))

  const installAriaLabel = computed(() => `${t('button.install')} ${title.value}`)

  const inProgress = computed(() => itemAsyncState(props.item) !== null)
</script>

<style lang="scss" scoped>
// The special icon of a featured plugin is this card's own (slot `#title-append`): primary on hover.
// `!important` as legacy: the Vuetify `text-*` colour of the icon is `!important`.
.primary-on-hover:hover {
  color: rgb(var(--v-theme-primary)) !important;
  transition: color 0.24s ease;
}
</style>
