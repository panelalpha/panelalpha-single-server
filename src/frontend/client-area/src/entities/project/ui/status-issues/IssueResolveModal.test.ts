import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { hydrateIssue, type InstanceLike } from './issue-registry'
import IssueResolveModal from './IssueResolveModal.vue'

const instance: InstanceLike = { id: 3 }
const portIssue = hydrateIssue(
  { code: 'deploy.port_mismatch', category: 'deploy', params: { port: 3000 } },
  instance,
)
const indexIssue = hydrateIssue({ code: 'deploy.missing_index', category: 'deploy', params: {} }, instance)

let host: HTMLDivElement | undefined

async function mountModal (props: Record<string, unknown>) {
  host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(IssueResolveModal, {
    props: { modelValue: true, instance, ...props },
    attachTo: host,
  })
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 50))
  return wrapper
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)

afterEach(() => {
  host?.remove()
  host = undefined
  for (const node of document.body.querySelectorAll('.v-overlay-container')) {
    node.remove()
  }
})

describe('IssueResolveModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the legacy card, titles, solution list and actions', async () => {
    const wrapper = await mountModal({ issue: portIssue })
    expect(q('.card-overlay')).not.toBeNull()
    const card = q('.v-card')!
    expectLegacyClasses(card, ['basic-modal', 'card-width-560'])
    expectLegacyClasses(q('.v-card-title')!, ['d-flex', 'justify-space-between', 'align-start'])
    expectLegacyClasses(q('.v-card-title h5')!, ['heading--text', 'mb-1'])
    expect(q('.v-card-title h5')!.textContent?.trim()).toBe('heading.instance.statusIndicator.deploy.portMismatch.modalTitle')
    expectLegacyClasses(q('.v-card-title p')!, ['p-3', 'text-gray-darken-1', 'mb-0'])
    expect(q('.v-card-text')!.textContent).toContain('heading.instance.statusIndicator.howToFix')
    const radios = document.body.querySelectorAll('.radio-container')
    expect(radios).toHaveLength(1)
    // the only solution is selected and shows its widget
    expect(radios[0]!.querySelector('.radio')!.classList.contains('radio--enabled')).toBe(true)
    expectLegacyClasses(q('.option-sub')!, ['option-sub', 'mb-4'])
    expectLegacyClasses(q('.v-card-actions')!, ['d-flex', 'justify-end', 'pb-8', 'pt-8', 'px-6'])
    const resolve = q('.issue-resolve-modal__resolve')!
    expect(resolve.classList.contains('bg-primary')).toBe(true)
    wrapper.unmount()
  })

  it('shows only the archive upload widget and keeps resolve disabled until a file is chosen', async () => {
    const wrapper = await mountModal({ issue: portIssue })
    expect(q('.option-sub .drop-zone')).not.toBeNull()
    expect(q('.option-sub input:not([type="file"])')).toBeNull()
    expect(q<HTMLButtonElement>('.issue-resolve-modal__resolve')!.disabled).toBe(true)
    wrapper.unmount()
  })

  it('emits resolve({ issue, solutionId, value }) with the chosen archive', async () => {
    // The API calls moved to the lite screen
    const wrapper = await mountModal({ issue: indexIssue })
    const input = q<HTMLInputElement>('.option-sub input[type="file"]')!
    const file = new File(['x'], 'site.zip')
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await nextTick()
    await nextTick()
    expect(q<HTMLButtonElement>('.issue-resolve-modal__resolve')!.disabled).toBe(false)
    q<HTMLButtonElement>('.issue-resolve-modal__resolve')!.click()
    await nextTick()
    expect(wrapper.emitted('resolve')?.[0]).toEqual([{ issue: indexIssue, solutionId: 'upload', value: file }])
    wrapper.unmount()
  })

  it('passes issue.params to the solution title and description (legacy :39,42)', async () => {
    const first = await mountModal({ issue: portIssue })
    first.unmount()
    const prefix = 'heading.instance.statusIndicator.deploy.portMismatch'
    i18next.addResource('en', 'translation', `${prefix}.upload.title`, 'Title {{port}}')
    i18next.addResource('en', 'translation', `${prefix}.upload.description`, 'Description {{port}}')
    try {
      const wrapper = await mountModal({ issue: portIssue })
      const radio = q('.radio-container')!
      expect(radio.textContent).toContain('Title 3000')
      expect(radio.textContent).toContain('Description 3000')
      wrapper.unmount()
    } finally {
      i18next.removeResourceBundle('en', 'translation')
      i18next.addResourceBundle('en', 'translation', {})
    }
  })

  it('disables the actions and hides the close button while submitting', async () => {
    const wrapper = await mountModal({ issue: portIssue, submitting: true })
    expect(q('.v-card-title .v-btn')).toBeNull()
    expect(q<HTMLButtonElement>('.issue-resolve-modal__resolve')!.disabled).toBe(true)
    q('.radio-container')!.click()
    await nextTick()
    expect(document.body.querySelector('.radio')!.classList.contains('radio--enabled')).toBe(true)
    wrapper.unmount()
  })

  it('closes through update:modelValue on cancel', async () => {
    const wrapper = await mountModal({ issue: portIssue })
    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>('.v-card-actions button')][0]!
    cancel.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
