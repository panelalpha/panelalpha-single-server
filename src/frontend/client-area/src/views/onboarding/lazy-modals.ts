import type { OnboardingStep } from './onboarding-steps'
import type { Component, ComputedRef } from 'vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { reportError } from '@/shared/errors/report-error'

/**
 * The 26 onboarding modals live in one chunk (`OnboardingModals.vue`), outside the entry file. This module is
 * the small part the entry keeps: the loader, the prefetch and the step reveal. Nothing here imports a `.vue` statically.
 */

type ModalsModule = { default: Component }

let pending: Promise<Component> | null = null

/** The chunk, loaded once. A failed load is forgotten, so the next open tries again (a flaky network, a deploy in between). */
export function loadOnboardingModals (importer: () => Promise<ModalsModule> = () => import('./OnboardingModals.vue')): Promise<Component> {
  if (!pending) {
    pending = importer().then(module => module.default, (error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}

/** Starts the download without waiting for it. A failure here is not an error yet: the open that needs the chunk handles it. */
export function prefetchOnboardingModals (importer?: () => Promise<ModalsModule>): void {
  loadOnboardingModals(importer).catch(() => undefined)
}

export interface IdleScheduler {
  requestIdle: (callback: () => void) => void
}

/** Browser idle time, with a timer where `requestIdleCallback` is missing (Safari). */
export function browserIdleScheduler (): IdleScheduler {
  return {
    requestIdle: callback => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => callback(), { timeout: 5000 })
        return
      }
      setTimeout(callback, 2000)
    },
  }
}

/** Fetches the modals chunk once the browser is idle: the first click on Create then finds it ready. */
export function prefetchOnboardingModalsWhenIdle (
  scheduler: IdleScheduler = browserIdleScheduler(),
  importer?: () => Promise<ModalsModule>,
): void {
  scheduler.requestIdle(() => prefetchOnboardingModals(importer))
}

/**
 * Whether the modals chunk has to be mounted: a step is open, the Git/env vars closing dialog is open, or the demo autostart is about
 * to open the process choice. Once mounted the host keeps it (the modals were always mounted before the split).
 */
export function shouldMountModals (state: { step: OnboardingStep | null, sshClosingOpen: boolean, autostart: boolean }): boolean {
  return state.step !== null || state.sshClosingOpen || state.autostart
}

/** For tests: forget the loaded chunk. */
export function resetLoadedModals (): void {
  pending = null
}

/**
 * The step the modals render. The modals used to be mounted while the step was `null` (also after the language change remounts
 * `v-app`: a flow is never open then), so every open was a change from closed to open: the dialogs ran their enter transition and
 * their `watch` on the open prop. A chunk that mounts with a step already set would skip both, so it shows `null` for one tick and
 * then the real step. This holds for every mount of the chunk, not only the first one.
 */
export function useRevealedStep (current: () => OnboardingStep | null): ComputedRef<OnboardingStep | null> {
  const revealed = ref(false)
  onMounted(() => {
    void nextTick(() => {
      revealed.value = true
    })
  })
  return computed(() => (revealed.value ? current() : null))
}

/** What the host does when the chunk cannot be loaded: report once and close the flow, so no blurred backdrop is left without a modal. */
export function handleModalsLoadFailure (error: unknown, closeFlow: () => void): void {
  reportError(error, { source: 'manual', componentName: 'OnboardingModalWrapper', info: 'onboarding modals chunk' })
  closeFlow()
}
