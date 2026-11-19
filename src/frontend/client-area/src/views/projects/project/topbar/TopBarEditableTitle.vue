<template>
  <div class="editor">
    <h1
      v-if="!editing"
      class="editor__title top-bar-title__button"
      data-testid="instance-title"
      v-bind="activatorProps"
    >
      <span class="top-bar-title__button-text">
        {{ instance.title }}
      </span>

      <!-- Legacy Vue 2 renders a space between the title and the icon (the `h1` is 10px wider with it). -->
      {{ ' ' }}

      <v-icon
        class="heading--text"
        icon="$chevrondown"
        size="24"
      />
    </h1>

    <v-form
      v-if="editing"
      class="editor__input-box"
    >
      <v-text-field
        v-model="editInput"
        class="h1"
        data-testid="instance-title-input"
        :disabled="frame.savingName"
        :loading="frame.savingName"
        variant="underlined"
        @keydown.enter.prevent="updateSiteName"
      />
    </v-form>

    <div
      v-if="instance.hasUpdateSiteNamePrivilege()"
      class="editor__buttons"
    >
      <div
        v-if="!editing"
        class="editor__controls editor__controls--open"
      >
        <AppButton
          :aria-label="t('button.edit')"
          data-testid="instance-title-edit"
          :disabled="frame.savingName"
          kind="icon"
          size="default"
          @click="openEditor"
        >
          <v-icon icon="$edit" />
        </AppButton>
      </div>

      <div
        v-else
        class="editor__controls editor__controls--closed"
      >
        <AppButton
          :aria-label="t('button.save')"
          color="primary"
          data-testid="instance-title-save"
          :disabled="frame.savingName"
          kind="icon"
          size="default"
          @click="updateSiteName"
        >
          <v-icon icon="$check" />
        </AppButton>

        <AppButton
          :aria-label="t('button.cancel')"
          data-testid="instance-title-cancel"
          :disabled="frame.savingName"
          kind="icon"
          size="default"
          @click="editing = false"
        >
          <v-icon icon="$close" />
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The title is the menu activator: `activatorProps`
  // from the parent's `v-menu` go to the `h1`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { ref, watch } from 'vue'
  import { useInstanceStore } from '@/views/projects/project/instance.store'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
    /** The `v-menu` activator props (`aria-*`, `onClick`), bound to the title. */
    activatorProps?: Record<string, unknown>
  }>()

  const frame = useInstanceStore()

  const { t } = useTranslation()

  const editing = ref(false)
  /** Taken from the title each time the editor opens, so a rename from the Site details card is picked up. */
  const editInput = ref(props.instance.title ?? '')

  function openEditor (): void {
    editInput.value = props.instance.title ?? ''
    editing.value = true
  }

  // The editor closes when the shared saving flag goes off, so a save started from the
  // Site details card closes this editor too, and an error closes it as well.
  watch(() => frame.savingName, saving => {
    if (!saving) {
      editing.value = false
    }
  })

  /** The store does the PUT, the alert and the title; the document title follows a successful save. */
  async function updateSiteName (): Promise<void> {
    if (await frame.updateSiteName(editInput.value)) {
      emitAppEvent('document-title-update')
    }
  }
</script>

<style lang="scss" scoped>
// Title rules, moved here with the `h1` they style (scoped styles of the parent do not reach this component).
.editor {
  display: flex;
  align-items: center;

  @media (min-width: 976px) {
    width: 565px;
    max-width: 700px;
    margin-bottom: 8px;
  }

  // The Vuetify internals (`.v-input`, `.v-field`, the native input) are rendered by child components, so Vue's scoped attribute
  // does not reach them: they need `:deep()`, or the rules never match.
  :deep(.v-input) {
    margin-top: 0;
    padding-top: 0;

    input {
      // !important: V4 `.v-field__input` sets its own bottom padding on the native input; legacy field is 4px.
      padding-bottom: 4px !important;
    }
  }

  // The legacy editor is 6px taller than its 46px input (the V2 field's details row), so the row's centred buttons sit 3px
  // below the input's centre (measured: save y 166 against the input at 160).
  .v-form :deep(.v-input.v-text-field) {
    margin-bottom: 6px;
  }

  &__input-box {
    // Legacy input is its native intrinsic width (a V2 text field is not stretched): 411 px at the 36px title, 301 px at the 26px
    // mobile one (derived from its 248.86 px after the flex shrink). The buttons follow 12 px after it, not the 565 px editor. V4
    // collapses the intrinsic width of the native input to 35 px, so the width is stated.
    flex: 0 1 411px;
    min-width: 0;

    @media (max-width: 975.98px) {
      flex-basis: 301px;
    }

    // Legacy `.h1` (36px, global `_fonts.scss`) reached the native input through the V2 `.v-input`. V4 `.v-field` has its own
    // 16px font size, so it inherits the heading size.
    :deep(.v-field) {
      font-size: inherit;
      // V4 `.v-field` adds 16px on both sides of the native input (12px in V2's `.v-input__slot`, none on the input); legacy's
      // input box starts at the form edge and the buttons follow 12px after it.
      --v-field-padding-start: 0;
      --v-field-padding-end: 0;
    }

    :deep(.v-input input) {
      width: 100%;
      // Chrome raises a text input to its normal line height (49px at 36px) whatever `line-height` says; legacy stays 46px at
      // both title sizes.
      max-height: 46px;
    }
  }

  &__buttons {
    // V4 icon buttons render 52px here, the V2 `v-btn icon` 40px (measured on the frame state). The V4 root type is
    // 16px / 24px; legacy's icon buttons are 14px / 21px.
    .v-btn {
      width: 40px;
      height: 40px;
      font-size: 14px;
      line-height: 21px;
    }

    // Save and cancel sit side by side, and wrap into a column when the editor is narrow (legacy mobile): the group shrinks
    // to one button's width and the second button goes below the first.
    .editor__controls--closed {
      display: flex;
      flex-wrap: wrap;
    }

    // Legacy cancel icon colour in light is `rgba(0, 0, 0, 0.54)` (V2 icon button); dark stays on the theme colour. Save keeps primary.
    .v-theme--light & .editor__controls--closed .v-btn:last-child:not(:hover) {
      color: var(--v-icon-btn-color);
    }

    margin-left: 12px;
    transition: opacity 0.24s ease;
    display: flex;
    align-items: center;
  }

  &__controls--open {
    opacity: 0;
  }

  &:hover .editor__controls--open {
    opacity: 1;
  }

  .v-btn:hover {
    color: rgb(var(--v-theme-primary));
  }
}

.top-bar-title__button {
  width: max-content;
  max-width: 100%;
}

@media (max-width: 975.98px) {
  .top-bar-title__button {
    max-width: 100%;
    white-space: nowrap;
    display: flex;
    align-items: center;
    // A long name must not push the editor's buttons past the window: the title shrinks (the text ellipses) and the
    // buttons keep their 40px, instead of the title's min-content width winning the row.
    min-width: 0;

    .v-icon {
      margin-top: 5px;
      margin-left: 10px;
    }
  }

  .top-bar-title__button-text {
    min-width: 0;
    display: inline-block;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    position: relative;
  }
}
</style>
