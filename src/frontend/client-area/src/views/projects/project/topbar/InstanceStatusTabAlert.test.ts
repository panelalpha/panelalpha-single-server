import type { InstanceResource } from '@/entities/project/instance-resource'
import type { ProjectSource } from '@/entities/project/project-source.api'
import type { AppHealth } from '@/entities/project/ui/status-issues/collect-instance-issues'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { fetchAppHealth } from '@/entities/project/instance-app-health.api'
import * as projectSourceApi from '@/entities/project/project-source.api'
import { emit } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import InstanceStatusTabAlert from './InstanceStatusTabAlert.vue'

vi.mock('@/entities/project/instance-app-health.api', () => ({
  fetchAppHealth: vi.fn(),
}))

vi.mock('@/entities/project/project-source.api', () => ({
  getProjectSource: vi.fn(),
}))

// `/source` of a project without warnings: the chip comes from app-health only.
const sourceClean: ProjectSource = { available: true, warnings: [] }

// The Engine's warnings of the project source, in the Engine's own words.
const sourceWarnings: ProjectSource = {
  available: true,
  warnings: [
    {
      code: 'deploy.last_deploy_warnings',
      title: 'The last deploy finished with warnings.',
      details: ['npm WARN deprecated left-pad', 'Build step skipped the lint'],
    },
    { code: 'deploy.not_deployable', title: 'The project cannot be deployed.', details: ['Add an index file.'] },
  ],
}

const missingIndex: AppHealth = {
  available: true,
  healthy: true,
  serving: 'missing_entry',
  ports: [{ port: 8080, status: 'ok', http_code: 403, detail: 'HTTP 403' }],
  checks: [{ id: 'entry-served', severity: 'error', title: 'The front page is missing.', detail: null, fix: null }],
}

const CHIP = '[data-testid="instance-status-tab-alert"]'

function instance (id: number): InstanceResource {
  return { id, type: 'custom', hasRedeployPrivilege: () => true } as unknown as InstanceResource
}

/** A project whose synced details say the Engine's last deploy finished with warnings (the real `express` answer). */
function partialDeploy (id: number): InstanceResource {
  return {
    ...instance(id),
    details: {
      deployment_status: 'partial',
      deployment_warnings: [
        { code: 'app_not_answering', message: 'The application started but did not answer on any port it publishes.' },
        { code: 'health_check_failed', message: 'The application is restarting, not running.' },
      ],
    },
  } as unknown as InstanceResource
}

let host: HTMLDivElement | undefined

async function mountAlert (inst: InstanceResource) {
  host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(InstanceStatusTabAlert, { props: { instance: inst }, attachTo: host })
  await flushPromises()
  return wrapper
}

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('InstanceStatusTabAlert', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchAppHealth).mockReset()
    vi.mocked(projectSourceApi.getProjectSource).mockReset()
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue(sourceClean)
  })

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('asks app-health for the instance and warns only about what it returned', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue(missingIndex)
    const wrapper = await mountAlert(instance(7))

    expect(fetchAppHealth).toHaveBeenCalledWith(7)
    expect((host!.querySelector(CHIP) !== null)).toBe(true)
    wrapper.unmount()
  })

  it('shows no chip for a healthy project', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue({ ...missingIndex, serving: 'ok', checks: [] })
    const wrapper = await mountAlert(instance(7))

    expect((host!.querySelector(CHIP) !== null)).toBe(false)
    wrapper.unmount()
  })

  it('shows no chip when the request is rejected', async () => {
    vi.mocked(fetchAppHealth).mockRejectedValue(new Error('Engine down'))
    const wrapper = await mountAlert(instance(7))

    expect((host!.querySelector(CHIP) !== null)).toBe(false)
    wrapper.unmount()
  })

  it('asks again after the instance id changes', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue(missingIndex)
    const wrapper = await mountAlert(instance(7))
    await wrapper.setProps({ instance: instance(8) })
    await flushPromises()

    expect(vi.mocked(fetchAppHealth).mock.calls).toEqual([[7], [8]])
    wrapper.unmount()
  })

  it('ignores a late answer for the previous instance', async () => {
    const first = deferred<AppHealth>()
    vi.mocked(fetchAppHealth)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...missingIndex, serving: 'ok', checks: [] })
    const wrapper = await mountAlert(instance(7))
    await wrapper.setProps({ instance: instance(8) })
    await flushPromises()

    first.resolve(missingIndex)
    await flushPromises()
    await nextTick()

    expect((host!.querySelector(CHIP) !== null)).toBe(false)
    wrapper.unmount()
  })

  it('shows an Engine check with its own title and detail and without an action button', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue({
      available: true,
      healthy: true,
      serving: 'placeholder',
      ports: [{ port: 8080, status: 'ok', http_code: 200 }],
      checks: [{ id: 'not-placeholder', severity: 'error', title: 'Placeholder page answers.', detail: null, fix: 'Deploy the application.' }],
    })
    const wrapper = await mountAlert(instance(7))
    await wrapper.get(CHIP).trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()

    const menu = document.body.querySelector('.status-list')
    expect(menu).not.toBeNull()
    expect(menu!.querySelector('.status-list__issue-title')!.textContent!.trim()).toBe('Placeholder page answers.')
    expect(menu!.querySelector('.status-list__issue-description')!.textContent!.trim()).toBe('Deploy the application.')
    expect(menu!.querySelector('.status-list__issue-action')).toBeNull()
    wrapper.unmount()
  })
  it('warns about the Engine warnings of the source, the not deployable one first, details on separate lines', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue({ ...missingIndex, serving: 'ok', checks: [] })
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue(sourceWarnings)
    const wrapper = await mountAlert(instance(7))
    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(7, { fresh: false })
    await wrapper.get(CHIP).trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()

    const titles = [...document.body.querySelectorAll('.status-list__issue-title')].map(node => node.textContent!.trim())
    expect(titles).toEqual(['The project cannot be deployed.', 'The last deploy finished with warnings.'])
    const descriptions = [...document.body.querySelectorAll('.status-list__issue-description')].map(node => node.textContent!.trim())
    expect(descriptions[1]).toBe('npm WARN deprecated left-pad\nBuild step skipped the lint')
    expect(document.body.querySelectorAll('.status-list__issue-action')).toHaveLength(0)
    wrapper.unmount()
  })

  it('warns about the deploy the project payload says the Engine finished with warnings', async () => {
    // The panel syncs `details.deployment_status`/`deployment_warnings`, so the chip shows before `/source` answers
    // (an Engine that reports its warnings only in the project details, or a `/source` that cannot be asked).
    vi.mocked(fetchAppHealth).mockResolvedValue({ ...missingIndex, serving: 'ok', checks: [] })
    const wrapper = await mountAlert(partialDeploy(7))
    await wrapper.get(CHIP).trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()

    const titles = [...document.body.querySelectorAll('.status-list__issue-title')].map(node => node.textContent!.trim())
    expect(titles).toEqual(['heading.instance.statusIndicator.deploy.lastDeployWarnings.title'])
    const descriptions = [...document.body.querySelectorAll('.status-list__issue-description')].map(node => node.textContent!.trim())
    expect(descriptions).toEqual(['The application started but did not answer on any port it publishes.\nThe application is restarting, not running.'])
    wrapper.unmount()
  })

  it('shows one deploy warning when the source and the payload report the same partial deploy', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue({ ...missingIndex, serving: 'ok', checks: [] })
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue(sourceWarnings)
    const wrapper = await mountAlert(partialDeploy(7))
    await wrapper.get(CHIP).trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()

    const codes = [...document.body.querySelectorAll('.status-list__issue-title')].map(node => node.textContent!.trim())
    expect(codes).toEqual(['The project cannot be deployed.', 'The last deploy finished with warnings.'])
    wrapper.unmount()
  })

  it('keeps the app-health issue when the source request is rejected', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue(missingIndex)
    vi.mocked(projectSourceApi.getProjectSource).mockRejectedValue(new Error('Engine down'))
    const wrapper = await mountAlert(instance(7))

    expect((host!.querySelector(CHIP) !== null)).toBe(true)
    wrapper.unmount()
  })

  it('reads the source fresh after an item change of this instance only', async () => {
    vi.mocked(fetchAppHealth).mockResolvedValue({ ...missingIndex, serving: 'ok', checks: [] })
    const wrapper = await mountAlert(instance(7))
    vi.mocked(projectSourceApi.getProjectSource).mockClear()

    emit('instance-item-changed', { id: 8 })
    await flushPromises()
    expect(projectSourceApi.getProjectSource).not.toHaveBeenCalled()

    emit('instance-item-changed', { id: 7 })
    await flushPromises()
    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(7, { fresh: true })
    wrapper.unmount()
  })
})
