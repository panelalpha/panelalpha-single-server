import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { VDialog } from 'vuetify/components'

// kit-dialog-onboarding: helpers of the shell and step tests of the onboarding modals, the same before and after the move to the kit.

/** The props of a step's dialog that the onboarding shell sets. */
export interface ShellProps {
  persistent: unknown
  scrim: unknown
  closeOnBack: unknown
  transition: unknown
  fullscreen: unknown
}

/** The shell props of the step's (first) dialog. */
export function shellProps (wrapper: VueWrapper): ShellProps {
  const dialog = wrapper.findComponent(VDialog)
  return {
    persistent: dialog.props('persistent'),
    scrim: dialog.props('scrim'),
    closeOnBack: dialog.props('closeOnBack'),
    transition: dialog.props('transition'),
    fullscreen: dialog.props('fullscreen'),
  }
}

/** A button on the page whose text contains `text` (copy keys are the text in tests). */
export function buttonWith (text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text))
}

/** The X of the open step (`ModalCloseButton`, `aria-label` `button.close`). */
export function closeButton (): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>('[aria-label="button.close"]')
}

/** The option cards of the open step. */
export function choiceCards (): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.selection-box .checkbox-big')]
}

export async function clickOn (element: Element | null | undefined): Promise<void> {
  if (!element) {
    throw new Error('nothing to click')
  }
  (element as HTMLElement).click()
  await flushPromises()
}
