<template>
  <div class="acc-select-group">
    <div class="acc-select-label">
      {{ t('heading.hosting.summary.hostingAccount') }}
      <v-tooltip
        location="bottom"
        open-delay="150"
        transition="custom-tooltip"
      >
        <template #activator="{ props: activatorProps }">
          <v-icon
            v-bind="activatorProps"
            icon="$help"
            size="16"
          />
        </template>

        <div>
          <p class="p-3 mb-0">
            {{ t('tooltip.hosting.summary.hostingAccount.tooltip') }}
          </p>
        </div>
      </v-tooltip>
    </div>

    <v-select
      v-model="model"
      class="dns-zone"
      hide-details
      item-title="domain"
      item-value="id"
      :items="items"
      :menu-props="{ offset: 8, contentClass: 'acc-select-menu' }"
      return-object
      variant="outlined"
    >
      <template #selection="{ item }">
        <span class="selected-item">{{ item.domain }}</span>
      </template>
    </v-select>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingAccountItem } from './hosting.types'
  import { useTranslation } from 'i18next-vue'

  defineProps<{
    items?: HostingAccountItem[]
  }>()

  const model = defineModel<HostingAccountItem | null>()

  const { t } = useTranslation()
</script>

<style lang="scss">
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 select menus carried the app text colour (rgb(73, 73, 95)); the global V4 menu rule gives them the theme's on-surface colour.
.v-menu > .v-overlay__content.acc-select-menu.acc-select-menu {
  color: var(--v-text-base);
}

// Title-bar use (`title-bar` class, FTP): legacy's title bar gave the label the 14px font's 1.5 line height (21px, the group is 73px tall).
// The summary sidebar keeps the 24px line height, so only the title-bar variant changes it.
.acc-select-group.title-bar .acc-select-label {
  line-height: 21px;
}

// Legacy block is unscoped (the selector label is styled from outside the component).
.acc-select-group {
  min-width: 260px;
  display: flex;
  flex-direction: column;

  .acc-select {
    &-label {
      color: var(--v-gray-darken1);
      margin-right: 4px;
      margin-bottom: 4px;
      font-size: 14px;
      font-style: normal;

      svg {
        cursor: pointer;
        width: 16px;
        height: 16px;
        transition: 0.3s;

        &:hover {
          path {
            stroke: var(--v-primary-base);
          }
        }
      }
    }
  }
}

// V2 `.v-input` of the outlined select is 51px high on desktop (the 48px field plus 3px below), V4's is 48px. Measured on mobile
// (375px) legacy is 48px again.
.acc-select-group .dns-zone {
  padding-bottom: 3px;

  @media (max-width: map.get(v.$grid-breakpoints, lg)) {
    padding-bottom: 0;
  }
}

// Title bar (FTP, SFTP): the group measures 73px in legacy = 21px label + 4px margin + the 48px field, so the field has no 3px below it.
.acc-select-group.title-bar .dns-zone {
  padding-bottom: 0;
}

.selected-item {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: block;
}
</style>
