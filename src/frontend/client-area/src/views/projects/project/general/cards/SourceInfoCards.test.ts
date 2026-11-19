import type { InstanceResource } from '@/entities/project/instance-resource'
import type { ProjectSource } from '@/entities/project/project-source.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as instanceApi from '@/views/projects/project/instance.api'
import * as projectSourceApi from '@/entities/project/project-source.api'
import { emit } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import FilesSourceInfoCard from './FilesSourceInfoCard.vue'
import GitSourceInfoCard from './GitSourceInfoCard.vue'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/projects/9/general', params: { id: '9' } }),
  useRouter: () => ({ push }),
}))

vi.mock('@/views/projects/project/instance.api', () => ({
  getGitSourceStatus: vi.fn(),
}))

vi.mock('@/entities/project/project-source.api', () => ({
  getProjectSource: vi.fn(),
  forgetProjectSource: vi.fn(),
}))

// `GET /instances/9/source` answer; `null` = the request gave no data (the cards fall back to the payload).
function mockSource (value: ProjectSource | null | Error): void {
  if (value instanceof Error) {
    vi.mocked(projectSourceApi.getProjectSource).mockRejectedValue(value)
    return
  }
  vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue(value)
}

// The kit maps t(key) to the key, so the assertions name legacy keys, not English copy.
interface Options {
  connected?: boolean
  redeploy?: boolean
  manageGit?: boolean
  database?: boolean
  source?: Record<string, unknown>
  details?: Record<string, unknown>
}

function makeInstance (options: Options = {}): InstanceResource {
  return {
    id: 9,
    git_repository: options.connected ? { connected: true, id: 3, repo_url: 'x', branch: 'main', commits_behind: 0, last_deployed_commit_hash: null } : null,
    source: {
      repo_name: 'acme/site',
      branch: 'develop',
      database: options.database ? { present: true, label: 'MariaDB 11' } : { present: false },
      ...options.source,
    },
    details: options.details ?? {},
    hasRedeployPrivilege: () => options.redeploy ?? true,
    hasManageGitPrivilege: () => options.manageGit ?? true,
    hasManageContainersPrivilege: () => true,
  } as unknown as InstanceResource
}

const stubs = { 'router-link': { template: '<a class="router-link-stub"><slot /></a>' } }

describe('GitSourceInfoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSource(null)
  })

  it('offers the manage button for a project without a connected repository and opens the page', async () => {
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('acme/site')
    expect(wrapper.text()).toContain('develop')
    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.database.notCreated')
    expect(instanceApi.getGitSourceStatus).not.toHaveBeenCalled()
    await wrapper.get('.v-card-actions .v-btn').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'project-git', params: { id: 9 } })
    wrapper.unmount()
  })

  it('shows the up-to-date line after the live status and emits the redeploy request', async () => {
    vi.mocked(instanceApi.getGitSourceStatus).mockResolvedValue({ commits_behind: 0 })
    const instance = makeInstance({ connected: true, database: true })
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.upToDate')
    expect(wrapper.text()).toContain('MariaDB 11')
    await wrapper.get('.v-card-actions .v-btn').trigger('click')
    expect(wrapper.emitted('action-redeploy')?.[0]).toEqual([instance])
    wrapper.unmount()
  })

  it('shows the commits-behind line and hides the action without the privilege', async () => {
    vi.mocked(instanceApi.getGitSourceStatus).mockResolvedValue({ commits_behind: 3 })
    const wrapper = await mountKit(GitSourceInfoCard, {
      props: { instance: makeInstance({ connected: true, redeploy: false }) },
      global: { stubs },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.commitsBehind')
    expect(wrapper.find('.v-card-actions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the branch with the commit of the last deploy from /source', async () => {
    mockSource({ available: true, last_deploy: { status: 'finished', commit: 'a1b2c3d4e5f6', finished_at: null } })
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()

    expect(wrapper.get('.git-ref').text()).toBe('develop · a1b2c3d')
    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(9, { fresh: false })
    wrapper.unmount()
  })

  it('takes the database from /source and the payload when the Engine could not answer', async () => {
    mockSource({ available: true, database: { present: true, label: 'MySQL 8' } })
    const fromSource = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance({ database: false }) }, global: { stubs } })
    await flushPromises()
    expect(fromSource.text()).toContain('MySQL 8')
    fromSource.unmount()

    mockSource({ available: false })
    const fallback = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance({ database: true }) }, global: { stubs } })
    await flushPromises()
    expect(fallback.text()).toContain('MariaDB 11')
    fallback.unmount()
  })

  it('reads /source fresh when the instance changes', async () => {
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()
    vi.mocked(projectSourceApi.getProjectSource).mockClear()

    emit('instance-item-changed', { id: 9 })
    await flushPromises()

    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(9, { fresh: true })
    wrapper.unmount()
  })

  it('shows the database skeleton until the first /source answer, then keeps the values on refresh', async () => {
    let answerFirst!: (value: ProjectSource) => void
    vi.mocked(projectSourceApi.getProjectSource).mockReturnValueOnce(new Promise<ProjectSource>(resolve => {
      answerFirst = resolve
    }))
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance({ database: true }) }, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.status-skeleton').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('MySQL 8')

    answerFirst({ available: true, database: { present: true, label: 'MySQL 8' } } as ProjectSource)
    await flushPromises()
    expect(wrapper.find('.status-skeleton').exists()).toBe(false)
    expect(wrapper.text()).toContain('MySQL 8')

    let answerRefresh!: (value: ProjectSource) => void
    vi.mocked(projectSourceApi.getProjectSource).mockReturnValueOnce(new Promise<ProjectSource>(resolve => {
      answerRefresh = resolve
    }))
    emit('instance-item-changed', { id: 9 })
    await flushPromises()
    expect(wrapper.find('.status-skeleton').exists()).toBe(false)
    expect(wrapper.text()).toContain('MySQL 8')

    answerRefresh({ available: true, database: { present: true, label: 'MySQL 9' } } as ProjectSource)
    await flushPromises()
    expect(wrapper.text()).toContain('MySQL 9')
    wrapper.unmount()
  })

  it('shows no status line when the status request fails', async () => {
    vi.mocked(instanceApi.getGitSourceStatus).mockRejectedValue(new Error('boom'))
    const wrapper = await mountKit(GitSourceInfoCard, { props: { instance: makeInstance({ connected: true }) }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('upToDate')
    expect(wrapper.text()).not.toContain('commitsBehind')
    wrapper.unmount()
  })
})

describe('FilesSourceInfoCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockSource(null)
  })

  it('renders the stack label without the archive size and the deployed state, and emits the upload request', async () => {
    mockSource({ available: true, stack: { label: 'Node.js' }, last_deploy: { status: 'finished', finished_at: '2026-03-05T10:07:00' } })
    const instance = makeInstance({
      details: { detected_stack: { label: 'Node.js' }, archive_size: 2048 },
      source: { last_deploy: { status: 'finished', finished_at: '2026-03-05T10:07:00' } },
    })
    const wrapper = await mountKit(FilesSourceInfoCard, { props: { instance }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('Node.js')
    expect(wrapper.text()).not.toContain('2 KB')
    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.deployed')
    await wrapper.get('.v-card-actions .v-btn').trigger('click')
    expect(wrapper.emitted('action-upload-version')?.[0]).toEqual([instance])
    wrapper.unmount()
  })

  it('shows the deploying and the failed deploy states from /source', async () => {
    mockSource({ available: true, last_deploy: { status: 'running' } })
    const deploying = await mountKit(FilesSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()
    expect(deploying.text()).toContain('heading.instance.siteDetails.source.deploying')
    deploying.unmount()

    mockSource({ available: true, last_deploy: { status: 'failed' } })
    const failed = await mountKit(FilesSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()
    expect(failed.text()).toContain('heading.instance.siteDetails.source.deployFailed')
    expect(failed.text()).not.toContain('heading.instance.siteDetails.source.deployed')
    failed.unmount()
  })

  it('says that a files project waits for its archive, and keeps the upload as the way out', async () => {
    mockSource({ available: true, last_deploy: { status: 'running', finished_at: null, waiting_for_files: true } })
    const wrapper = await mountKit(FilesSourceInfoCard, { props: { instance: makeInstance() }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.waitingForFiles')
    expect(wrapper.text()).toContain('heading.instance.siteDetails.source.waitingForFilesHint')
    expect(wrapper.text()).not.toContain('heading.instance.siteDetails.source.deploying')
    expect(wrapper.text()).toContain('button.uploadNewVersion')
    wrapper.unmount()
  })

  it('falls back to the payload stack when /source fails', async () => {
    mockSource(new Error('boom'))
    const instance = makeInstance({ details: { detected_stack: { label: 'PHP' } } })
    const wrapper = await mountKit(FilesSourceInfoCard, { props: { instance }, global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('PHP')
    wrapper.unmount()
  })

  it('hides the upload button without the redeploy privilege', async () => {
    const wrapper = await mountKit(FilesSourceInfoCard, { props: { instance: makeInstance({ redeploy: false }) }, global: { stubs } })

    expect(wrapper.find('.v-card-actions .v-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('source cards frame (kit-page-frame)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockSource(null)
  })

  it('Git and Files: a quarter column, a card with the source title and the actions row', async () => {
    for (const card of [GitSourceInfoCard, FilesSourceInfoCard]) {
      const wrapper = await mountKit(card, { props: { instance: makeInstance() }, global: { stubs } })
      await flushPromises()

      expect(wrapper.get('.responsive-card').classes()).toEqual(expect.arrayContaining(['v-col--cols-12', 'v-col--cols-sm-6', 'v-col--cols-md-6', 'v-col--cols-xl-3']))
      expect(wrapper.get('.v-card-title').text()).toBe('heading.instance.siteDetails.source.title')
      expect(wrapper.find('.v-card-actions .v-btn').exists()).toBe(true)
      wrapper.unmount()
    }
  })
})
