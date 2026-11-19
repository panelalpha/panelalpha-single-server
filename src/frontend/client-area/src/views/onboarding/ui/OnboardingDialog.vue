<template>
  <AppDialog
    :close-on-back="closeOnBack"
    :fullscreen="fullscreen"
    :model-value="modelValue"
    persistent
    :scrim="false"
    :transition="animated ? 'fade-transition' : false"
  >
    <slot />
  </AppDialog>
</template>

<script lang="ts" setup>
  // Dialog shell of an onboarding step (variants `onboarding` and `fullscreen`): `AppDialog` without a
  // scrim (the blurred `main-overlay` of `OnboardingModalWrapper` is the backdrop), always `persistent`, and the body lock (`scrollLock`
  // on `<html>`) while it is open. `data-testid` and the other attributes fall through to the dialog.
  // `animated: false`: the steps of the new-site flow swap without a fade.
  // `closeOnBack`: the env vars step and the full-screen ones keep the V4 default (the browser back button is held while they are open).
  // `bodyLock: false`: the template gallery, which held no body lock in legacy.
  import { toRef } from 'vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    fullscreen?: boolean
    animated?: boolean
    closeOnBack?: boolean
    bodyLock?: boolean
  }>(), {
    fullscreen: false,
    animated: true,
    closeOnBack: false,
    bodyLock: true,
  })

  if (props.bodyLock) {
    useBodyScrollLock(toRef(props, 'modelValue'))
  }
</script>
