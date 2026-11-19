<template>
  <div>
    <PageTitle
      :title="t('heading.connectAi.capabilities')"
      title-testid="connect-ai-capabilities-title"
    />

    <v-card
      data-testid="connect-ai-capabilities"
      elevation="4"
    >
      <v-card-text>
        <v-expansion-panels
          elevation="0"
          :rounded="4"
        >
          <v-expansion-panel
            v-for="category in CAPABILITY_CATEGORIES"
            :key="category.key"
            data-testid="connect-ai-capability"
          >
            <v-expansion-panel-title class="font-weight-600 p-1">
              <div class="d-flex align-center capabilities-category-title">
                <v-icon
                  class="capabilities-icon"
                  color="primary"
                  :icon="category.icon"
                  size="18"
                />
                {{ t(categoryLabelKey(category)) }}
              </div>
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <ul class="capabilities-list">
                <li
                  v-for="command in category.commands"
                  :key="command"
                  class="capabilities-list__item"
                  data-testid="connect-ai-capability-command"
                >
                  <p class="capabilities-list__text p-2 mb-0">
                    {{ t(command) }}
                  </p>

                  <copy-text-button
                    class="capabilities-list__copy"
                    color="var(--v-gray-darken1)"
                    size="16"
                    :text="t(command)"
                  />
                </li>
              </ul>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  // A static list of what the assistant can do. The text goes through `t()`,
  // so the terminology post-processor gives Project wording on single server.
  import { useTranslation } from 'i18next-vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { CAPABILITY_CATEGORIES, categoryLabelKey } from './capabilities'

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// The category title row has an inline `gap: 12px`, as in legacy.
.capabilities-category-title {
  gap: 12px;
}

// Each command is a prompt the user can say to the assistant: a tinted row with an accent bar, the text in the body colour and a copy button that is always visible.
.capabilities-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.capabilities-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 8px 16px;
  border-left: 3px solid rgb(var(--v-theme-primary));
  border-radius: 4px 8px 8px 4px;
  background: var(--v-gray-lighten5);
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--v-gray-lighten2);
  }
}

.capabilities-list__text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--v-gray-darken2);
  overflow-wrap: anywhere;
}

.capabilities-list__copy {
  flex-shrink: 0;
}

// V2 `.v-card__text:last-child` kept its 24px bottom padding and took the card's corners; V4 ends the card with `.v-card__overlay`.
.v-card-text {
  padding-bottom: 24px;
  border-radius: inherit;
}

.v-expansion-panels {
  border-radius: 4px;
}

// V2 `v-expansion-panels flat`: 4px corners on the first panel's top, the last panel's bottom, an open panel and the panel after it;
// V4 draws square corners.
.v-expansion-panel {
  border-radius: 0;

  &:first-child {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  &:last-child {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  &.v-expansion-panel--active {
    border-radius: 4px;
  }

  &.v-expansion-panel--active + .v-expansion-panel {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }
}

.v-expansion-panel-title {
  // V2 `flat` has no divider between panels, and its `$expand` chevron has no glyph (the MDI font is not loaded): the box stays, nothing draws.
  :deep(.v-expansion-panel-title__icon) {
    visibility: hidden;
  }

  // V2 header: the panel's top corners, and the bottom ones only while closed; its UA button border colour is black.
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  border-color: var(--v-btn-text-border);
}

.v-expansion-panel:not(.v-expansion-panel--active) > .v-expansion-panel-title {
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}

// The rows start 8px below the open title, so the title keeps its own band.
.v-expansion-panel-text :deep(.v-expansion-panel-text__wrapper) {
  padding: 8px 24px 16px;
}

// Opening a category must not move anything: V4 grows the open title from 48 to 64 px and adds 16 px above the open panel and the one after it.
.v-expansion-panel--active:not(:first-child),
.v-expansion-panel--active + .v-expansion-panel {
  margin-top: 0;
}

.v-expansion-panel--active > .v-expansion-panel-title:not(.v-expansion-panel-title--static) {
  min-height: 48px;
}

// V2 `flat`: no line between panels (V4 draws one with `::after`).
.v-expansion-panel::after {
  display: none;
}

// V4 sizes an icon box at 1.5em (V2: the 18px svg).
.capabilities-icon {
  width: 18px;
  height: 18px;
  min-width: 0;
  flex-shrink: 0;
  font-size: 18px;

  :deep(svg) {
    width: 18px;
    height: 18px;
  }
}
</style>
