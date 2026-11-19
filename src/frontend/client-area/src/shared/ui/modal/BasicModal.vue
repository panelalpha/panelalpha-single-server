<template>
  <v-card
    class="basic-modal"
    :class="customClass"
    elevation="4"
  >
    <v-card-title class="d-flex justify-space-between">
      <!-- With a `title-append` action the heading takes the free space (`me-auto`), so the action sits next to the X at the right edge. -->
      <h6
        class="heading--text d-flex align-center"
        :class="{ 'me-auto': !!$slots['title-append'] }"
        :data-testid="titleTestid"
      >
        <v-icon
          v-if="icon"
          class="mr-4"
          :color="color ? color : 'primary'"
          :icon="icon"
          size="24"
        />

        <span v-safe-html="title" />
      </h6>

      <!-- An action in the title row, right before the X (Containers Logs: Refresh); empty by default, so the title row is as before. -->
      <slot name="title-append" />

      <modal-close-button
        v-if="closeVisible && !submitting"
        :class="closeClass"
        :data-testid="closeTestid"
        :push-right="false"
        @click="emit('modal-close')"
      />
    </v-card-title>

    <pre>{{ submittingProgressLog }}</pre>

    <v-card-text>
      <div>
        <div
          v-if="messageLoader"
          class="mb-7 text-center"
        >
          <loader
            :size="120"
            :width="12"
          >
            <v-icon
              icon="$loadingHourglass"
              size="30"
            />
          </loader>
        </div>

        <p
          v-if="messageTitle"
          v-safe-html="messageTitle"
          class="mb-2 h6"
          :class="messageTitleClass"
        />

        <p
          v-if="message"
          v-safe-html="message"
          class="mb-4 p-2"
          :class="messageClass"
        />

        <AppMessage
          v-if="alert"
          class="my-5"
          icon="$alertcircle"
          variant="warning"
        >
          <span>{{ alert }}</span>
        </AppMessage>

        <AppMessage
          v-if="submitReason"
          class="my-5"
          data-testid="modal-submit-reason"
          icon="$alertcircle"
          variant="warning"
        >
          <span>{{ submitReason }}</span>
        </AppMessage>

        <div
          v-if="targetBox"
          v-safe-html="targetBox"
          class="basic-modal-target"
        />

        <!-- The box with a rating: the star is a component, so it cannot go through the `targetBox` HTML (legacy: `$starIcon` and `b.p-4`). -->
        <div
          v-else-if="targetRatingBox"
          class="basic-modal-target"
        >
          <span
            class="target-item-box target-item-box--rated"
            :class="{
              'target-item-box--flat': targetRatingBox.flat,
              'target-item-box--border-darker': targetRatingBox.border === 'gray-lighten2',
            }"
          >
            <span
              v-safe-html="targetRatingBox.labelHtml"
              class="target-item-name"
            />

            <span
              class="target-item-rating ml-auto"
              data-testid="target-item-rating"
            >
              <!-- Legacy `<v-icon :percent="rating / 100">$starIcon</v-icon>`: the attribute reaches the star component, which fills that share. -->
              <v-icon
                class="mr-1"
                size="20"
              >
                <StarIcon :percent="targetRatingBox.percent" />
              </v-icon>

              <b class="p-4">{{ targetRatingBox.rating }}</b>
            </span>
          </span>
        </div>

        <slot name="custom" />

        <v-form
          v-if="$slots.default"
          ref="form"
          class="d-flex flex-column"
        >
          <slot :validate="validate" />
        </v-form>

        <div v-if="affixLink && !affixLink.hidden">
          <component
            :is="!affixLink.external ? 'router-link' : 'a'"
            class="text-info"
            :href="affixLink.external ? affixLink.url : undefined"
            :to="!affixLink.external ? affixLink.url : undefined"
          >
            {{ affixLink.message }}
          </component>
        </div>
      </div>
    </v-card-text>

    <v-card-actions
      class="d-flex flex-wrap pb-4"
      :class="actionsClasses"
    >
      <div
        v-for="button in buttons"
        :key="button.id"
        class="w-100 pb-2"
        :class="button.customClass"
      >
        <!-- Kit button: the same props as before, plus the optional hooks of `ModalButton`. -->
        <AppButton
          block
          :class="[button.color === 'normal' ? 'normal' : undefined, button.buttonClass]"
          :color="button.color === 'normal' ? undefined : button.color"
          :data-testid="button.testId"
          :disabled="stateOf(button).disabled"
          elevation="0"
          :href="button.href"
          :loading="stateOf(button).loading"
          size="large"
          :variant="button.color === 'normal' ? 'text' : 'flat'"
          @click="onButtonClick(button)"
        >
          <template #loader>
            <!-- With a label next to it the spinner is the small white one (Hub Disconnect: `settings.hub.disconnecting`). -->
            <loader
              color="white"
              no-margins
              :size="20"
            />

            <span
              v-if="button.loadingLabel"
              class="ml-3 font-weight-600"
            >{{ button.loadingLabel }}</span>
          </template>

          <span
            class="p-2"
            :class="button.color === 'normal' ? 'font-weight-bold text--gray-darken1' : 'font-weight-600'"
          >{{ button.label }}</span>

          <v-icon
            v-if="button.appendIcon"
            class="ml-2"
            :icon="button.appendIcon"
            size="24"
          />
        </AppButton>
      </div>

      <!-- Free actions after the buttons (the `actions` slot of `McpTokenModal`); empty by default. -->
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  // App-lite differs from the legacy modal only in the `role` select slots and `formValues`.
  // The screen owns the `v-dialog` and the field values; fields are composed in the default slot.
  import { provide, ref, useTemplateRef } from 'vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StarIcon from '@/shared/ui/icons/star.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { buttonState, type ModalButton } from './basic-modal-buttons'
  import { type ModalAffixLink, type ModalTargetRatingBox, showPasswordKey } from './basic-modal.types'
  import ModalCloseButton from './ModalCloseButton.vue'

  const props = withDefaults(defineProps<{
    // `title`, `messageTitle` and `message` are HTML, rendered with `v-safe-html` (profile `copy`). The filter is
    // the safety net, not the escape: i18n has `escapeValue: false`, so still escape API/user values interpolated into them.
    title?: string
    messageTitle?: string
    message?: string
    // Legacy `custom` slot (`target-item-box`): trusted HTML after the message, outside its `<p>`. Set by the install, delete, mass update and mass delete dialogs.
    targetBox?: string
    // Legacy `custom` slot with a rating (install plugin and theme): the box rendered here with the kit star, instead of `targetBox`.
    targetRatingBox?: ModalTargetRatingBox
    messageTitleClass?: string
    messageClass?: string
    icon?: string
    color?: string
    customClass?: string
    alert?: string
    // Why the action buttons are off, as its own warning after `alert`.
    submitReason?: string
    submitting?: boolean
    submittingProgressLog?: string
    messageLoader?: boolean
    affixLink?: ModalAffixLink
    buttons?: ModalButton[]
    actionsClasses?: string
    loadingMode?: string
    loading?: boolean
    confirmRequired?: boolean
    confirmed?: boolean
    // The consumer can hide the X (`closeVisible`), give it a hook class (`closeClass`: the locked or transparent
    // X of the reseller and Connect AI modals) and a test id; the heading gets a test id (`titleTestid`).
    closeVisible?: boolean
    closeClass?: string | Record<string, boolean>
    closeTestid?: string
    titleTestid?: string
  }>(), {
    title: undefined,
    messageTitle: undefined,
    message: undefined,
    targetBox: undefined,
    targetRatingBox: undefined,
    messageTitleClass: undefined,
    messageClass: undefined,
    icon: undefined,
    color: 'primary',
    customClass: undefined,
    alert: undefined,
    submitReason: undefined,
    submitting: false,
    submittingProgressLog: undefined,
    messageLoader: false,
    affixLink: undefined,
    buttons: () => [],
    actionsClasses: undefined,
    loadingMode: undefined,
    loading: false,
    confirmRequired: false,
    confirmed: false,
    closeVisible: true,
    closeClass: undefined,
    closeTestid: undefined,
    titleTestid: undefined,
  })

  const emit = defineEmits<{
    'modal-close': []
    'button-click': [id: string]
  }>()

  // One visibility flag for every password field of the modal, as legacy `showPassword`.
  provide(showPasswordKey, ref(false))

  const form = useTemplateRef<{ validate: () => Promise<{ valid: boolean, errors: unknown[] }> }>('form')

  /**
   * V4 `v-form.validate()` of the inner form (resolves `{ valid, errors }`); `valid` when there are no fields.
   * It does not call the exposed `validate()` of a `text-select` field (`TextSelectInput`), as legacy: the rules of that field get the
   * composed `text.parent` value, so an empty text part passes `required` and only the backend rejects it.
   */
  async function validate (): Promise<{ valid: boolean, errors: unknown[] }> {
    return form.value ? form.value.validate() : { valid: true, errors: [] }
  }

  function stateOf (button: ModalButton) {
    return buttonState(button, {
      submitting: props.submitting,
      loading: props.loading,
      loadingMode: props.loadingMode,
      confirmRequired: props.confirmRequired,
      confirmed: props.confirmed,
    })
  }

  function onButtonClick (button: ModalButton): void {
    if (!props.submitting && !button.disabled) {
      emit('button-click', button.id)
    }
  }

  defineExpose({ validate })
</script>

<style
  lang="scss"
  scoped
  src="./BasicModal.scss"
/>
