<template>
  <transition
    :duration="!enabled ? 1 : undefined"
    enter-active-class="enter-active"
    leave-active-class="leave-active"
    @after-enter="afterEnter"
    @after-leave="afterLeave"
    @before-enter="beforeEnter"
    @before-leave="beforeLeave"
    @enter="enter"
    @leave="leave"
  >
    <slot />
  </transition>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    enabled?: boolean
  }>(), {
    enabled: true,
  })

  function beforeEnter (element: Element): void {
    const el = element as HTMLElement
    requestAnimationFrame(() => {
      if (!el.style.height) {
        el.style.height = '0px'
      }
      el.style.display = ''
    })
  }

  function enter (element: Element): void {
    const el = element as HTMLElement
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.height = `${el.scrollHeight}px`
      })
    })
  }

  function afterEnter (element: Element): void {
    ;(element as HTMLElement).style.height = ''
  }

  function beforeLeave (element: Element): void {
    const el = element as HTMLElement
    requestAnimationFrame(() => {
      if (!el.style.height) {
        el.style.height = `${el.offsetHeight}px`
      }
    })
  }

  function leave (element: Element): void {
    const el = element as HTMLElement
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.height = '0px'
      })
    })
  }

  function afterLeave (element: Element): void {
    ;(element as HTMLElement).style.height = ''
  }
</script>

<!-- Unscoped: scoped styles do not reach the slotted element. -->
<style lang="scss">
.enter-active,
.leave-active {
  overflow: hidden;
  transition: height 0.5s ease;
}
</style>
