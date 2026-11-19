import type { CollectedIssue, InstanceLike } from './issue-registry'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VMenu } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import StatusIndicator from './StatusIndicator.vue'

// A custom project has no deploy issues in the list any more (they come from app-health), so the modal path gets its
// `openModal` issues injected.
let injected: CollectedIssue[] = []
vi.mock('./collect-instance-issues', async importOriginal => {
  const original = await importOriginal<Record<string, unknown> & { collectInstanceIssues: (i: InstanceLike) => CollectedIssue[] }>()
  return { ...original, collectInstanceIssues: (instance: InstanceLike) => [...original.collectInstanceIssues(instance), ...injected] }
})
const deployIssues: CollectedIssue[] = [
  { code: 'deploy.missing_index', category: 'deploy', params: {} },
  { code: 'deploy.port_mismatch', category: 'deploy', params: { port: 3000 } },
]

const outdated: InstanceLike = {
  id: 5,
  type: 'wordpress',
  status: { wordpress: '6.4', wordpress_available: '6.5' },
}
const healthy: InstanceLike = { id: 5, type: 'wordpress', status: { wordpress: '6.5', wordpress_available: '6.5' } }
const custom: InstanceLike = { id: 5, type: 'custom' }

let host: HTMLDivElement | undefined

async function mountIndicator (props: Record<string, unknown>) {
  host = document.createElement('div')
  document.body.append(host)
  return mountKit(StatusIndicator, { props, attachTo: host })
}

async function openMenu (wrapper: Awaited<ReturnType<typeof mountKit>>) {
  const activator = wrapper.find('.status-indicator-container, .status-indicator-tab-activator')
  await activator.trigger('mouseenter')
  await new Promise(resolve => setTimeout(resolve, 250))
  await nextTick()
}

afterEach(() => {
  injected = []
  host?.remove()
  host = undefined
  for (const node of document.body.querySelectorAll('.v-overlay-container')) {
    node.remove()
  }
})

describe('StatusIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders only the empty root when there are no issues (card)', async () => {
    const wrapper = await mountIndicator({ instance: healthy })
    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toEqual(['status-indicator-root'])
    expect(wrapper.find('.status-indicator-container').exists()).toBe(false)
    wrapper.unmount()
  })

  it('card variant with issues: warning badge, samesize modifier (legacy :27-65)', async () => {
    const wrapper = await mountIndicator({ instance: outdated })
    expectLegacyClasses(wrapper.get('.status-indicator-container').element, ['status-indicator-container'])
    expectLegacyClasses(wrapper.get('.status-indicator').element, ['status-indicator', 'status-indicator--warning'])
    expect(wrapper.get('.status-indicator').classes()).not.toContain('status-indicator--samesize')
    expect(wrapper.get('.status-indicator .v-icon').classes()).toContain('text-error')
    await wrapper.setProps({ sameSize: true })
    expectLegacyClasses(wrapper.get('.status-indicator').element, ['status-indicator--warning', 'status-indicator--samesize'])
    wrapper.unmount()
  })

  it('card variant menu: left of the activator, hover, min-width 280, card content classes (legacy :9-26)', async () => {
    const wrapper = await mountIndicator({ instance: outdated })
    const menu = wrapper.findComponent(VMenu)
    expect(menu.props('location')).toBe('start top')
    expect(menu.props('offset')).toEqual([16, 50])
    expect(menu.props('openOnHover')).toBe(true)
    expect(menu.props('openDelay')).toBe(150)
    expect(menu.props('closeDelay')).toBe(150)
    expect(menu.props('closeOnContentClick')).toBe(false)
    expect(menu.props('minWidth')).toBe(280)
    await openMenu(wrapper)
    const content = document.body.querySelector<HTMLElement>('.v-overlay__content')!
    expectLegacyClasses(content, [
      'elevation-4--before', 'elevation-4', 'status-indicator-menu', 'elevation-4--after', 'status-indicator-menu--card',
    ])
    wrapper.unmount()
  })

  it('shows the Engine warnings of a deploy that finished with warnings, in the Engine\'s own words', async () => {
    const failedDeploy: InstanceLike = {
      id: 5,
      type: 'custom',
      details: {
        deployment_status: 'partial',
        deployment_warnings: [{ code: 'app_not_answering', message: 'The application started but did not answer on any port it publishes.' }],
      },
    }
    const wrapper = await mountIndicator({ instance: failedDeploy })
    expect(wrapper.find('.status-indicator--warning').exists()).toBe(true)
    await openMenu(wrapper)
    const menu = document.body.querySelector('.status-list')!
    // The registry's copy says what the state is; the Engine's sentence says what it found.
    expect(menu.querySelector('.status-list__issue-title')!.textContent!.trim()).toBe('heading.instance.statusIndicator.deploy.lastDeployWarnings.title')
    expect(menu.querySelector('.status-list__issue-description')!.textContent!.trim()).toBe('The application started but did not answer on any port it publishes.')
    wrapper.unmount()
  })

  it('tab variant with issues: root modifier, chip and below-start menu (legacy :2-8,17-26,37-48)', async () => {
    const wrapper = await mountIndicator({ instance: outdated, variant: 'tab' })
    expectLegacyClasses(wrapper.element, ['status-indicator-root', 'status-indicator-root--tab'])
    expect(wrapper.classes()).not.toContain('status-indicator-root--empty')
    expectLegacyClasses(wrapper.get('.status-indicator-tab-activator').element, [
      'd-inline-flex', 'align-center', 'status-indicator-tab-activator',
    ])
    expectLegacyClasses(wrapper.get('.v-chip').element, ['text-error', 'error', 'p-3', 'px-2', 'py-1', 'ml-2', 'v-chip--label'])
    expect(wrapper.find('.status-indicator').exists()).toBe(false)
    const menu = wrapper.findComponent(VMenu)
    expect(menu.props('location')).toBe('bottom start')
    await openMenu(wrapper)
    const content = document.body.querySelector<HTMLElement>('.v-overlay__content')!
    expectLegacyClasses(content, ['elevation-4--before', 'elevation-4', 'status-indicator-menu'])
    expect(content.classList.contains('status-indicator-menu--card')).toBe(false)
    expect(content.classList.contains('elevation-4--after')).toBe(false)
    wrapper.unmount()
  })

  it('tab variant without issues adds the empty modifier (legacy :5-6)', async () => {
    const wrapper = await mountIndicator({ instance: healthy, variant: 'tab' })
    expectLegacyClasses(wrapper.element, ['status-indicator-root', 'status-indicator-root--tab', 'status-indicator-root--empty'])
    expect(wrapper.find('.v-chip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('swaps the badge for a loader while an update is pending (legacy hasActionPending :231-233)', async () => {
    const updating: InstanceLike = { ...outdated, hasUpdateInProgress: () => true }
    const card = await mountIndicator({ instance: updating })
    expect(card.find('.status-indicator').exists()).toBe(false)
    expectLegacyClasses(card.get('.status-indicator-container .loader').element, ['d-flex', 'justify-center', 'loader'])
    card.unmount()
    const tab = await mountIndicator({ instance: updating, variant: 'tab' })
    expect(tab.find('.v-chip').exists()).toBe(false)
    expectLegacyClasses(tab.get('.status-indicator-tab-activator > span').element, ['ml-2', 'd-inline-flex'])
    expect(tab.find('.loader').exists()).toBe(true)
    tab.unmount()
  })

  it.each([
    ['create', 'pending'],
    ['create', 'in_progress'],
    ['restore', 'pending'],
    ['restore', 'in_progress'],
  ])('a backup %s %s counts as pending (legacy :217-230)', async (key, value) => {
    const instance: InstanceLike = { ...outdated, backup_details: [{ id: 1, async_status: { [key]: value } }] }
    const wrapper = await mountIndicator({ instance })
    expect(wrapper.find('.loader').exists()).toBe(true)
    expect(wrapper.find('.status-indicator').exists()).toBe(false)
    wrapper.unmount()
  })

  it('a finished backup is not pending', async () => {
    const instance: InstanceLike = { ...outdated, backup_details: [{ id: 1, async_status: { create: 'done' } }] }
    const wrapper = await mountIndicator({ instance })
    expect(wrapper.find('.loader').exists()).toBe(false)
    wrapper.unmount()
  })

  it('groups issues by CATEGORY_ORDER with titles, descriptions and actions (legacy :67-110,205-211)', async () => {
    const instance: InstanceLike = {
      ...custom,
      status: { woocommerce: '8.0', woocommerce_available: '8.1' },
      hasAutomaticBackup: () => false,
    }
    injected = deployIssues
    const wrapper = await mountIndicator({ instance })
    await openMenu(wrapper)
    const list = document.body.querySelector<HTMLElement>('.status-list')!
    const groups = [...list.querySelectorAll<HTMLElement>('.status-list__group')]
    expect(groups.map(g => g.querySelector('.status-list__title')!.textContent)).toEqual([
      'heading.instance.statusIndicator.category.deploy',
      'heading.instance.statusIndicator.category.woocommerce',
      'heading.instance.statusIndicator.category.backup',
    ])
    expectLegacyClasses(groups[0]!, ['d-flex', 'flex-column', 'status-list__group'])
    expectLegacyClasses(groups[0]!.querySelector('.status-list__title')!, ['status-list__title', 'p-4'])
    const issues = groups[0]!.querySelectorAll<HTMLElement>('.status-list__issue')
    expect(issues).toHaveLength(2)
    expectLegacyClasses(issues[0]!.querySelector('.status-list__icon')!, ['status-list__icon', 'mt-1', 'text-error'])
    expectLegacyClasses(issues[0]!.querySelector('.status-list__issue-title')!, ['status-list__issue-title', 'p-2', 'font-weight-bold'])
    expectLegacyClasses(issues[0]!.querySelector('.status-list__issue-description')!, ['status-list__issue-description', 'p-3'])
    const action = issues[0]!.querySelector<HTMLElement>('.status-list__issue-action')!
    expectLegacyClasses(action, ['status-list__issue-action', 'mt-2', 'bg-primary'])
    expect(action.textContent?.trim()).toBe('button.statusIndicator.resolve')
    wrapper.unmount()
  })

  it('emits action(issue) for a route action instead of navigating (legacy :46-53)', async () => {
    const wrapper = await mountIndicator({ instance: outdated })
    await openMenu(wrapper)
    document.body.querySelector<HTMLElement>('.status-list__issue-action')!.click()
    await nextTick()
    const issue = wrapper.emitted('action')?.[0]?.[0] as { code: string, action: { type: string, to: (i: InstanceLike) => string } }
    expect(issue.code).toBe('wordpress.core_outdated')
    expect(issue.action.to(outdated)).toBe('5/general')
    expect(document.body.querySelector('.card-overlay')).toBeNull()
    wrapper.unmount()
  })

  it('hides the action when the instance lacks the update privilege', async () => {
    const wrapper = await mountIndicator({ instance: { ...outdated, hasWordPressUpdatePrivilege: () => false } })
    await openMenu(wrapper)
    expect(document.body.querySelector('.status-list__issue-action')).toBeNull()
    wrapper.unmount()
  })

  it('lists no deploy group for a custom project', async () => {
    const wrapper = await mountIndicator({ instance: { ...custom, hasAutomaticBackup: () => false } })
    await openMenu(wrapper)
    const titles = [...document.body.querySelectorAll('.status-list__title')].map(el => el.textContent)
    expect(titles).toEqual(['heading.instance.statusIndicator.category.backup'])
    wrapper.unmount()
  })

  it('opens IssueResolveModal for a modal action and leaves the issue to the host after resolve (legacy :46-63)', async () => {
    injected = deployIssues
    const wrapper = await mountIndicator({ instance: custom })
    await openMenu(wrapper)
    const portButton = [...document.body.querySelectorAll<HTMLElement>('.status-list__issue')]
      .find(el => el.textContent?.includes('portMismatch'))!
      .querySelector<HTMLElement>('.status-list__issue-action')!
    portButton.click()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(document.body.querySelector('.card-overlay')).not.toBeNull()
    const input = document.body.querySelector<HTMLInputElement>('.option-sub input[type="file"]')!
    const file = new File(['x'], 'site.zip')
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await nextTick()
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('.issue-resolve-modal__resolve')!.click()
    await nextTick()
    const payload = wrapper.emitted('resolve')?.[0]?.[0] as { solutionId: string, value: unknown, issue: { code: string } }
    expect(payload).toMatchObject({ solutionId: 'upload', value: file })
    expect(payload.issue.code).toBe('deploy.port_mismatch')
    // the host resolves it after the upload: nothing is dismissed locally
    expect(document.body.querySelector('.card-overlay')).not.toBeNull()
    wrapper.unmount()
  })

  it('markResolved (called by the screen after the upload succeeds) dismisses the issue and closes the dialog', async () => {
    injected = deployIssues
    const wrapper = await mountIndicator({ instance: custom })
    await openMenu(wrapper)
    const indexButton = [...document.body.querySelectorAll<HTMLElement>('.status-list__issue')]
      .find(el => el.textContent?.includes('missingIndex'))!
      .querySelector<HTMLElement>('.status-list__issue-action')!
    indexButton.click()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(document.body.querySelector('.card-overlay')).not.toBeNull()
    // upload-archive is the first solution and waits for the host: no local dismissal
    expect(wrapper.emitted('resolve')).toBeUndefined()
    const exposed = wrapper.vm as unknown as { markResolved: (code: string) => void }
    exposed.markResolved('deploy.missing_index')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(wrapper.findComponent({ name: 'IssueResolveModal' }).exists()).toBe(false)
    await openMenu(wrapper)
    const titles = [...document.body.querySelectorAll('.status-list__issue-title')].map(el => el.textContent)
    expect(titles.some(t => t?.includes('missingIndex'))).toBe(false)
    expect(titles.some(t => t?.includes('portMismatch'))).toBe(true)
    wrapper.unmount()
  })
})
