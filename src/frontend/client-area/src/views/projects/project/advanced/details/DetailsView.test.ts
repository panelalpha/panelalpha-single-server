import type { VueWrapper } from '@vue/test-utils'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerMetricsCurrent } from '@/views/hosting/hosting.api'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import DetailsView from './DetailsView.vue'

// The redeploy modals do HTTP on open; these tests only check which one is mounted and opened after a limits Save.
const redeploy = vi.hoisted(() => ({ git: vi.fn(), files: vi.fn() }))

vi.mock('@/views/projects/project/general/modals/GitRedeployModal.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'GitRedeployModal',
      emits: ['reload-instance'],
      setup (_props, { expose }) {
        expose({ open: redeploy.git })
        return () => null
      },
    }),
  }
})

vi.mock('@/views/projects/project/general/modals/FilesUploadVersionModal.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'FilesUploadVersionModal',
      emits: ['reload-instance'],
      setup (_props, { expose }) {
        expose({ open: redeploy.files })
        return () => null
      },
    }),
  }
})

vi.mock('@/entities/project/ui/ProjectLimitsModal.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({ name: 'ProjectLimitsModal', emits: ['saved'], setup: () => () => null }),
  }
})

vi.mock('@/views/projects/project/instance.api', () => ({
  getInstallationDetails: vi.fn(),
}))

vi.mock('@/views/hosting/hosting.api', () => ({
  getServerMetricsCurrent: vi.fn(),
}))

interface Options {
  container?: boolean
  source?: 'git' | 'files' | null
  redeploy?: boolean
}

function makeInstance ({ container = true, source = 'git', redeploy: canRedeploy = true }: Options = {}): InstanceResource {
  return {
    id: 7,
    title: 'Site',
    type: container ? 'custom' : 'wordpress',
    isContainer: container,
    staging: false,
    screenshot_url: null,
    resources: {
      usage: null,
      disk: null,
      limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: -1, device_read_bps: -1, device_write_bps: -1 },
      ceilings: { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null },
    },
    hasGitSource: () => source === 'git',
    hasFilesSource: () => source === 'files',
    hasRedeployPrivilege: () => canRedeploy,
    hasManageLimitsPrivilege: () => true,
    hasViewInstallationDetailsPrivilege: () => false,
  } as unknown as InstanceResource
}

async function mountView (instance: InstanceResource, singleServer = false): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().home = { app: { single_server: { active: singleServer } }, user: { services: [] } } as never
  const wrapper = await mountKit(DetailsView, {
    props: { instance },
    global: {
      plugins: [pinia],
      stubs: { SiteDetailsCard: true, ProjectUsageCards: true, InstallationDetailsCard: true, InstanceCardImgNotAvailable: true },
    },
  })
  await flushPromises()
  return wrapper
}

async function saveLimits (wrapper: VueWrapper, needsRebuild = true): Promise<void> {
  wrapper.findComponent({ name: 'ProjectLimitsModal' }).vm.$emit('saved', needsRebuild)
  await flushPromises()
}

function byTestId (wrapper: VueWrapper, id: string) {
  return wrapper.find(`[data-testid="${id}"]`)
}

const NOTE = 'project-limits-rebuild-note'
const REDEPLOY = 'project-limits-redeploy'

describe('DetailsView after a limits Save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows no rebuild note before a Save', async () => {
    const wrapper = await mountView(makeInstance())

    expect(byTestId(wrapper, NOTE).exists()).toBe(false)
  })

  it('shows the note with Redeploy now for a git container project, which opens the git redeploy modal', async () => {
    const wrapper = await mountView(makeInstance({ source: 'git' }))
    await saveLimits(wrapper)

    expect(byTestId(wrapper, NOTE).text()).toContain('heading.instance.advanced.projectLimits.rebuildNote')
    expect(wrapper.findComponent({ name: 'FilesUploadVersionModal' }).exists()).toBe(false)
    await byTestId(wrapper, REDEPLOY).trigger('click')
    expect(redeploy.git).toHaveBeenCalledOnce()
    expect(redeploy.files).not.toHaveBeenCalled()
  })

  it('opens the files upload modal for a files container project', async () => {
    const wrapper = await mountView(makeInstance({ source: 'files' }))
    await saveLimits(wrapper)

    expect(wrapper.findComponent({ name: 'GitRedeployModal' }).exists()).toBe(false)
    await byTestId(wrapper, REDEPLOY).trigger('click')
    expect(redeploy.files).toHaveBeenCalledOnce()
    expect(redeploy.git).not.toHaveBeenCalled()
  })

  it('shows only the note for a classic project, and mounts no redeploy modal', async () => {
    const wrapper = await mountView(makeInstance({ container: false }))
    await saveLimits(wrapper)

    expect(byTestId(wrapper, NOTE).exists()).toBe(true)
    expect(byTestId(wrapper, REDEPLOY).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'GitRedeployModal' }).exists()).toBe(false)
  })

  it('shows no Redeploy now without the redeploy privilege', async () => {
    const wrapper = await mountView(makeInstance({ redeploy: false }))
    await saveLimits(wrapper)

    expect(byTestId(wrapper, NOTE).exists()).toBe(true)
    expect(byTestId(wrapper, REDEPLOY).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'GitRedeployModal' }).exists()).toBe(false)
  })

  it('shows no note when the save changed no limit that needs a rebuild', async () => {
    const wrapper = await mountView(makeInstance())
    await saveLimits(wrapper, false)

    expect(byTestId(wrapper, 'project-limits-rebuild-note').exists()).toBe(false)
  })

  it('keeps the note after a later save that needs no rebuild', async () => {
    const wrapper = await mountView(makeInstance())
    await saveLimits(wrapper, true)
    await saveLimits(wrapper, false)

    expect(byTestId(wrapper, NOTE).exists()).toBe(true)
  })

  it('closes the note', async () => {
    const wrapper = await mountView(makeInstance())
    await saveLimits(wrapper)

    await byTestId(wrapper, 'project-limits-rebuild-note-close').trigger('click')
    expect(byTestId(wrapper, NOTE).exists()).toBe(false)
  })
})

describe('DetailsView server size for the usage rings', () => {
  const GB = 1024 * 1024 * 1024

  function unlimitedDisk (): InstanceResource {
    const instance = makeInstance()
    instance.resources = {
      ...instance.resources!,
      disk: { total_bytes: GB, limit_bytes: -1, measured_at: null },
    }
    return instance
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the server size to the cards on a single server when a ring has no limit', async () => {
    vi.mocked(getServerMetricsCurrent).mockResolvedValue({ ram_total: 4 * 1024 * 1024, disk_total: 100 * GB } as never)
    const wrapper = await mountView(unlimitedDisk(), true)

    expect(getServerMetricsCurrent).toHaveBeenCalledOnce()
    expect(wrapper.findComponent({ name: 'ProjectUsageCards' }).props('server')).toEqual({ memoryBytes: 4 * GB, diskBytes: 100 * GB })
  })

  it('does not ask for the server size when every ring has a limit', async () => {
    await mountView(makeInstance(), true)

    expect(getServerMetricsCurrent).not.toHaveBeenCalled()
  })

  it('does not ask for the server size outside a single server, where the metrics do not exist', async () => {
    const wrapper = await mountView(unlimitedDisk(), false)

    expect(getServerMetricsCurrent).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'ProjectUsageCards' }).props('server')).toBeNull()
  })

  it('keeps the bare amount without an error alert when the metrics fail', async () => {
    vi.mocked(getServerMetricsCurrent).mockRejectedValue(new Error('down'))
    const wrapper = await mountView(unlimitedDisk(), true)

    expect(wrapper.findComponent({ name: 'ProjectUsageCards' }).props('server')).toBeNull()
  })
})
