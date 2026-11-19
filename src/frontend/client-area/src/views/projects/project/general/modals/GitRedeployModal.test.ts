import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as gitApi from '@/views/projects/project/advanced/git/git.api'
import * as instanceApi from '@/views/projects/project/instance.api'
import * as projectSourceApi from '@/entities/project/project-source.api'
import { mountKit } from '@/test/mount-kit'
import GitRedeployModal from './GitRedeployModal.vue'

vi.mock('@/views/projects/project/instance.api', () => ({
  getGitCommits: vi.fn(),
  getGitSourceStatus: vi.fn(),
  redeployInstance: vi.fn(),
}))

vi.mock('@/entities/project/project-source.api', () => ({
  getProjectSource: vi.fn(),
  forgetProjectSource: vi.fn(),
}))

vi.mock('@/views/projects/project/advanced/git/git.api', () => ({
  getGitBranches: vi.fn(async () => ['main', 'dev']),
}))

vi.mock('@/entities/project/use-deploy-logs', async () => {
  const { ref } = await import('vue')
  return {
    useDeployLogs: () => ({
      status: ref('running'),
      currentStage: ref(null),
      stages: ref([]),
      lines: ref([]),
      error: ref(null),
      warning: ref(null),
      isRunning: ref(true),
      downloadLogId: ref(null),
      finishedLogId: ref(null),
      cancelling: ref(false),
      downloading: ref(false),
      cancelDeploy: vi.fn(),
      download: vi.fn(),
    }),
  }
})

const instance = {
  id: 7,
  source: { repo_name: 'acme/site' },
  git_repository: { connected: true, branch: 'main', last_deployed_commit_hash: 'aaaaaaaaaa' },
  subInstances: [],
  parentInstance: null,
} as unknown as InstanceResource

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(GitRedeployModal, { props: { instance }, global: { plugins: [pinia] }, attachTo: host })
}

describe('GitRedeployModal', () => {
  beforeEach(() => {
    vi.mocked(instanceApi.getGitCommits).mockResolvedValue({
      commits: [{ hash: 'abcdef123456', message: 'Fix header' }],
      from: 'aaaaaaaaaa',
      to: 'abcdef123456',
      total: 1,
    })
    vi.mocked(instanceApi.getGitSourceStatus).mockResolvedValue({ drift_status: 'clean' })
    vi.mocked(instanceApi.redeployInstance).mockResolvedValue({ target_id: 7, deploy_log_id: 3 })
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue({
      available: true,
      deploy_steps: {
        dependencies: { commands: ['npm install'], skippable: true },
        build: { commands: ['npm run build'], skippable: true },
        migrations: { commands: [], skippable: false },
      },
    } as unknown as projectSourceApi.ProjectSource)
  })

  it('lists the deploy steps of the target and sends only the unchecked skippable ones as skip', async () => {
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(7)
    expect(bodyQuery('[data-step="dependencies"]')).not.toBeNull()
    expect(bodyQuery('[data-step="build"]')).not.toBeNull()
    expect(bodyQuery('[data-step="migrations"]')).toBeNull()
    expect(bodyQuery('[data-testid="git-redeploy-modal"]')?.textContent).not.toContain('heading.instance.siteDetails.redeploy.runBuild')

    const build = bodyQuery('[data-step="build"] input[type="checkbox"]') as HTMLInputElement
    expect(build.checked).toBe(true)
    build.click()
    await flushPromises()
    expect(build.checked).toBe(false)

    ;(bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(instanceApi.redeployInstance).toHaveBeenCalledWith(7, {
      branch: 'main',
      strategy: undefined,
      deploy_staging: false,
      skip: ['build'],
    })
    wrapper.unmount()
  })

  it('opens with the repository and the new commits, redeploys and switches to the logs phase', async () => {
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect(bodyQuery('[data-testid="git-redeploy-repo"]')?.textContent).toContain('acme/site')
    expect(bodyQuery('[data-testid="git-redeploy-commits"]')?.textContent).toContain('Fix header')
    expect(instanceApi.getGitCommits).toHaveBeenCalledWith(7, 'main')

    const submit = bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    submit.click()
    await flushPromises()

    expect(instanceApi.redeployInstance).toHaveBeenCalledWith(7, {
      branch: 'main',
      strategy: undefined,
      deploy_staging: false,
    })
    expect(bodyQuery('[data-testid="git-redeploy-submit"]')).toBeNull()
    expect(bodyQuery('[data-testid="git-redeploy-close"]')).not.toBeNull()
    // the deploy just started: it stays `running` from here, and the footer must still offer to stop it
    expect((bodyQuery('[data-testid="git-redeploy-cancel-deploy"]') as HTMLButtonElement).textContent).toBe('deployLogs.cancelDeploy')
    wrapper.unmount()
  })

  it('hides the steps section when /source is unavailable and redeploys without skip', async () => {
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue({ available: false } as unknown as projectSourceApi.ProjectSource)
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect(bodyQuery('.deploy-steps')).toBeNull()
    expect(bodyQuery('[data-step="dependencies"]')).toBeNull()
    const submit = bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    submit.click()
    await flushPromises()

    const payload = vi.mocked(instanceApi.redeployInstance).mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('skip')
    wrapper.unmount()
  })

  it('enables the rebuild of the deployed commit when the branch has no new commits', async () => {
    vi.mocked(instanceApi.getGitCommits).mockResolvedValue({ commits: [], from: 'a', to: 'a', total: 0 })
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect((bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement).disabled).toBe(false)
    expect(bodyQuery('[data-testid="git-redeploy-commits"]')?.textContent).toContain('heading.instance.siteDetails.redeploy.rebuildSame')
    wrapper.unmount()
  })

  it('explains a branch the checkout has not fetched and still lets the redeploy fetch it', async () => {
    vi.mocked(instanceApi.getGitCommits).mockResolvedValue({ commits: [], from: null, to: null, total: 0, branchFetched: false })
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect(bodyQuery('[data-testid="git-redeploy-commits"]')?.textContent).toContain('heading.instance.siteDetails.redeploy.branchNotFetched')
    expect(bodyQuery('[data-testid="git-redeploy-commits"]')?.textContent).not.toContain('heading.instance.siteDetails.redeploy.fetchError')
    const submit = bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    submit.click()
    await flushPromises()

    expect(instanceApi.redeployInstance).toHaveBeenCalledWith(7, { branch: 'main', strategy: undefined, deploy_staging: false })
    wrapper.unmount()
  })

  it('keeps Redeploy disabled when the branch list fails to load (listError)', async () => {
    vi.mocked(gitApi.getGitBranches).mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    expect((bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  // The X, Cancel and `persistent` of the card before and after it moves onto `BasicModal`.
  it('closes from the X in the form phase (kit-dialog-advanced)', async () => {
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()

    ;(bodyQuery('[data-testid="git-redeploy-close-icon"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('hides the X, disables Cancel and keeps the dialog persistent while the redeploy request runs (kit-dialog-advanced)', async () => {
    vi.mocked(instanceApi.redeployInstance).mockReturnValue(new Promise(() => {}))
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(false)

    ;(bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    expect(bodyQuery('[data-testid="git-redeploy-close-icon"]')).toBeNull()
    expect((bodyQuery('[data-testid="git-redeploy-cancel"]') as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('stays open from the X in the logs phase until the deploy ends (kit-dialog-advanced)', async () => {
    const wrapper = await mountModal()
    await (wrapper.vm as unknown as { open: () => Promise<void> }).open()
    await flushPromises()
    ;(bodyQuery('[data-testid="git-redeploy-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    expect((bodyQuery('[data-testid="git-redeploy-close"]') as HTMLButtonElement).disabled).toBe(true)
    ;(bodyQuery('[data-testid="git-redeploy-close-icon"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })
})
