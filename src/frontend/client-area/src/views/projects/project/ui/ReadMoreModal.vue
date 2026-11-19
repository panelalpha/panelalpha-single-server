<template>
  <AppDialog
    :model-value="modelValue"
    transition="custom-dialog-transition"
    @update:model-value="emit('update:model-value', $event)"
  >
    <v-card
      class="readme-card card-width-560"
      :class="`readme-card--${frame}`"
    >
      <div
        v-if="$slots.media"
        class="readme-card__img"
      >
        <slot name="media" />
      </div>

      <div class="readme-card__content">
        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center">
            <slot name="title-prepend" />

            <h5
              v-if="titleHtml"
              v-safe-html:external="title"
            />

            <h5 v-else>{{ title }}</h5>

            <StatusLabel
              v-if="status === 'active'"
              class="ms-4"
              status="primary"
              :value="t('message.status.active')"
            />

            <StatusLabel
              v-else-if="status === 'disabled'"
              class="ms-4"
              status="gray"
              :value="t('message.status.disabled')"
            />
          </div>

          <v-icon
            class="ml-4"
            color="gray-darken-2"
            icon="$close"
            size="24px"
            @click="close"
          />
        </div>

        <div
          v-safe-html:external="description"
          class="mt-8 mb-6 p-1 description"
        />

        <div class="d-flex align-center justify-space-between flex-wrap">
          <div class="d-flex align-center mt-2">
            <AppButton
              color="gray"
              elevation="0"
              size="large"
              variant="outlined"
              @click="close"
            >
              <span class="heading--text">{{ t('button.close') }}</span>
            </AppButton>
          </div>

          <div
            v-if="$slots.meta"
            class="d-flex align-center mt-2"
          >
            <slot name="meta" />
          </div>

          <div class="d-flex align-center mt-2">
            <slot name="actions-prepend" />

            <AppButton
              v-if="showInstall"
              color="primary"
              elevation="0"
              size="large"
              @click="emit('action-install')"
            >
              <v-icon
                color="white"
                icon="$installIcon"
                size="24"
              />
              {{ ` ${t('button.install')}` }}
            </AppButton>

            <AppButton
              v-if="showActivate"
              class="mr-4"
              color="primary"
              elevation="0"
              size="large"
              @click="emit('action-activate')"
            >
              <v-icon
                color="white"
                icon="$checkcircle"
                size="24"
              />
              {{ ` ${t('button.activate')}` }}
            </AppButton>

            <AppButton
              v-if="showUpdate"
              color="error"
              elevation="0"
              size="large"
              @click="emit('action-update')"
            >
              <v-icon
                color="white"
                icon="$update"
                size="24"
              />
              {{ ` ${t('button.update')}` }}
            </AppButton>
          </div>
        </div>
      </div>
    </v-card>
  </AppDialog>
</template>

<script lang="ts" setup>
  // Read more card of the project pages: one shell for the theme and the plugin Read more
  // (`ThemeReadMoreModal.vue`, `PluginReadMoreModal.vue`). One look: the 560 px card of the dialog family (`card-width-560`), the 6 px status frame,
  // the sanitized description (`v-safe-html:external`), the Close / Install / Activate / Update buttons.
  // The consumers map their item to the props and keep what is theirs in the slots: `media` (the theme screenshot), `title-prepend`
  // (the plugin icon), `meta` (the theme rating; pass it as `<template v-if="…" #meta>` so an empty one renders nothing) and
  // `actions-prepend` (the theme preview). The action emits carry no data and do not close: the consumer emits its own event with
  // the item and closes when it should (the plugin Install keeps the card open).
  import { useTranslation } from 'i18next-vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  withDefaults(defineProps<{
    modelValue: boolean
    title: string
    // The plugin title is HTML from the API (`v-safe-html:external`); the theme title is text (decoded by the consumer).
    titleHtml?: boolean
    description: string
    frame: 'gray' | 'red' | 'green'
    // No status: no chip (a catalogue item of Add New).
    status?: 'active' | 'disabled'
    showInstall?: boolean
    showActivate?: boolean
    showUpdate?: boolean
  }>(), {
    titleHtml: false,
    status: undefined,
    showInstall: false,
    showActivate: false,
    showUpdate: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
    'action-install': []
    'action-activate': []
    'action-update': []
  }>()

  const { t } = useTranslation()

  function close (): void {
    emit('update:model-value', false)
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// Scoped styles of both Read more modals.
// The width is the global `card-width-560` (`_dialog.scss`), and the card keeps `overflow: visible` of `_dialog.scss`.
.readme-card {
  border-top: 6px solid;
  border-radius: 8px;
}

// The global `.v-theme--* .v-card:not(…)` rule (`_card.scss`, 0,3,0) sets the sheet colour on every card, so the frame colour needs 0,4,0
// (`.v-card.readme-card.readme-card--*` + scope attribute).
.v-card.readme-card {
  border-color: var(--v-gray-lighten3);

  &.readme-card--red {
    border-color: rgb(var(--v-theme-error));
  }

  &.readme-card--green {
    border-color: rgb(var(--v-theme-primary));
  }
}

.readme-card__content {
  padding: 32px;
}

// The description is HTML set by `v-safe-html`, without the scope attribute, so its rules go through `:deep()`.
.description {
  // The legacy `base--text` colour (`map-get($text, base)`): the token `--v-text-base`, not the on-surface colour.
  color: var(--v-text-base);
  display: block;
  flex-direction: column;

  :deep(p) {
    font-size: v.$font-size-lg;
    line-height: v.$line-height-lg;
    margin-bottom: 20px;
  }

  :deep(ul) {
    list-style: disc;
  }

  :deep(blockquote) {
    background-color: var(--v-gray-lighten5);
    margin: 20px 0;
    padding: 16px 16px 16px 80px;
    border-radius: 6px;
    position: relative;

    &::before {
      position: absolute;
      content: '';
      width: 45px;
      height: 45px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDUiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCA0NSA0NSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeT0iOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiByeD0iMiIgZmlsbD0iI0RFREVGMSIvPgo8cGF0aCBkPSJNMTcuNSAyMVYzNkMxNy41IDM3LjEwNDYgMTYuNjA0NiAzOCAxNS41IDM4SDgiIHN0cm9rZT0iI0RFREVGMSIgc3Ryb2tlLXdpZHRoPSI1Ii8+CjxyZWN0IHg9IjI1IiB5PSI4IiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSIyIiBmaWxsPSIjREVERUYxIi8+CjxwYXRoIGQ9Ik00Mi41IDIxVjM2QzQyLjUgMzcuMTA0NiA0MS42MDQ2IDM4IDQwLjUgMzhIMzMiIHN0cm9rZT0iI0RFREVGMSIgc3Ryb2tlLXdpZHRoPSI1Ii8+Cjwvc3ZnPgo=");
      left: 16px;
      top: 16px;
    }

    * {
      margin-bottom: 0;
      font-weight: v.$font-weight-bold;
      font-size: v.$font-size-base;
      line-height: v.$line-height-base;
      color: var(--v-gray-darken1);

      a {
        color: rgb(var(--v-theme-primary));
      }
    }
  }

  :deep(ul),
  :deep(ol) {
    margin-bottom: 20px;
    padding-left: 0;

    > li {
      list-style-position: inside;
      font-size: v.$font-size-lg;
      line-height: v.$line-height-lg;

      &:not(:last-child) {
        margin-bottom: 4px;
      }
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin-bottom: 16px;
    font-size: v.$font-size-xlg;
    line-height: v.$line-height-xlg;
    font-style: normal;
    color: var(--v-text-darken2);
  }

  // `!important` stays, as in legacy. An iframe from the API HTML can carry its own size (attribute or inline),
  // which has to lose to this rule.
  :deep(iframe) {
    max-width: 100% !important;
    width: 100% !important;
    margin: 20px 0;
  }
}
</style>
