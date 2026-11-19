<template>
  <div
    ref="container"
    aria-hidden="true"
    class="wizard-confetti"
    data-testid="wizard-confetti"
  />
</template>

<script lang="ts" setup>
  import type { AnimationItem } from 'lottie-web'
  import { onBeforeUnmount, onMounted, ref } from 'vue'

  // The confetti over the number of the last step: a Lottie animation that plays twice. `lottie-web`
  // and the animation file load on demand, so they stay out of the main bundle and out of the chunk of the wizard.
  const container = ref<HTMLElement | null>(null)
  let animation: AnimationItem | undefined
  let unmounted = false

  onMounted(async () => {
    try {
      const [{ default: lottie }, { default: animationData }] = await Promise.all([
        import('lottie-web'),
        import('./assets/animations/confetti.json'),
      ])
      if (unmounted || container.value === null) {
        return
      }
      animation = lottie.loadAnimation({
        container: container.value,
        renderer: 'svg',
        loop: 2,
        autoplay: true,
        animationData,
      })
    } catch {
      // The confetti is decoration: a failed load leaves the step as it is.
    }
  })

  onBeforeUnmount(() => {
    unmounted = true
    animation?.destroy()
    animation = undefined
  })
</script>

<style lang="scss" scoped>
  // The animation is 400x400, `top`/`left` -184px, so it is centred on the 32px number.
  .wizard-confetti {
    position: absolute;
    top: -184px;
    left: -184px;
    z-index: 100;
    width: 400px;
    height: 400px;
    pointer-events: none;
  }
</style>
