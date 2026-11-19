import type { VueWrapper } from '@vue/test-utils'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import * as gitApi from './git.api'
import GitCardSkeleton from './GitCardSkeleton.vue'
import GitView from './GitView.vue'

// The redeploy modal does HTTP on open; the view tests only check when it is opened.
const redeploy = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('@/views/projects/project/general/modals/GitRedeployModal.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'GitRedeployModal',
      emits: ['reload-instance'],
      setup (_props, { expose }) {
        expose({ open: redeploy.open })
        return () => null
      },
    }),
  }
})

vi.mock('./git.api', () => ({
  getGitStatus: vi.fn(),
  getGitLogs: vi.fn(),
  connectGit: vi.fn(),
  disconnectGit: vi.fn(),
  updateGitCredentials: vi.fn(),
  getGitBranches: vi.fn(),
  changeBranch: vi.fn(),
  setAutoDeploy: vi.fn(),
  pullGit: vi.fn(),
  pushGit: vi.fn(),
  revertGit: vi.fn(),
  ignoreGitDrift: vi.fn(),
  repairGit: vi.fn(),
  getGitDeployKey: vi.fn(),
  createGitDeployKey: vi.fn(),
  deleteGitDeployKey: vi.fn(),
}))

interface InstanceOptions {
  manage?: boolean
  parentInstance?: unknown
  subInstances?: unknown[]
}

function makeInstance (connected: boolean, options: InstanceOptions = {}): InstanceResource {
  return {
    id: 9,
    git_repository: connected ? { connected: true, id: 3, repo_url: 'https://example.test/acme.git', branch: 'main', commits_behind: 0, last_deployed_commit_hash: null } : null,
    parentInstance: options.parentInstance ?? null,
    subInstances: options.subInstances ?? [],
    hasManageGitPrivilege: () => options.manage ?? true,
  } as unknown as InstanceResource
}

// A staging of the pair whose repository is connected: the connect form then offers the reuse toggle.
function pairedStaging (): unknown {
  return { id: 12, git_repository: { connected: true, id: 77, repo_url: 'https://example.test/pair.git', branch: 'develop', commits_behind: 0, last_deployed_commit_hash: null } }
}

function findButton (wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(node => node.text() === label)
  if (!button) {
    throw new Error(`no button "${label}"`)
  }
  return button
}

function statusResponse (connected: boolean, hasSyncedOnce: boolean) {
  return {
    connected,
    has_synced_once: hasSyncedOnce,
    commits_behind: 0,
    commits_ahead: 0,
    async_status: { git_auto_deploy: null },
  }
}

async function mountView (instance: InstanceResource) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(GitView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, pinia }
}

// Every page the user may manage git on reads the current deploy key; a test that cares sets its own answer.
beforeEach(() => {
  vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(null)
})

describe('GitView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the unconnected skeleton while the status loads for an instance without a repository', async () => {
    vi.mocked(gitApi.getGitStatus).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView(makeInstance(false))

    const skeleton = wrapper.findComponent(GitCardSkeleton)
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.props('connected')).toBe(false)
  })

  it('shows the connected skeleton while the status loads for a connected instance', async () => {
    vi.mocked(gitApi.getGitStatus).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.findComponent(GitCardSkeleton).props('connected')).toBe(true)
  })

  it('hides the skeleton once the status is loaded', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)

    const { wrapper } = await mountView(makeInstance(false))

    expect(wrapper.findComponent(GitCardSkeleton).exists()).toBe(false)
  })

  it('shows the unsupported-hosting alert and subtitle when the status says git is not supported', async () => {
    vi.mocked(gitApi.getGitStatus).mockRejectedValue({ response: { status: 422, data: { message: 'Git is not supported here.' } } })

    const { wrapper } = await mountView(makeInstance(false))

    expect(wrapper.text()).toContain('heading.instance.advanced.git.hostingUnsupported')
    expect(wrapper.text()).not.toContain('heading.instance.advanced.git.connect.subtitle')
    expect(useAlertsStore().activeAlerts).toEqual([])
  })

  it('shows a toast with the error message for any other failure', async () => {
    vi.mocked(gitApi.getGitStatus).mockRejectedValue({ response: { status: 500, data: { message: 'Boom.' } } })

    const { wrapper } = await mountView(makeInstance(false))

    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Boom.' })])
    expect(wrapper.text()).toContain('heading.instance.advanced.git.connect.subtitle')
  })

  it('reads the status once on entry for an unconnected instance', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)

    await mountView(makeInstance(false))

    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(1)
    expect(gitApi.getGitLogs).not.toHaveBeenCalled()
  })

  it('reads the status up to three times on entry for a connected pair that has not synced yet', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(true, false) as never)

    await mountView(makeInstance(true))

    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(3)
    expect(gitApi.getGitLogs).toHaveBeenCalledTimes(1)
  })

  it('reads the status twice on entry for a connected pair that has synced', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(true, true) as never)

    await mountView(makeInstance(true))

    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(2)
  })
})

describe('GitView connect form', () => {
  const connectLabel = 'heading.instance.advanced.git.connect.button'
  const urlInput = (wrapper: VueWrapper) => wrapper.findAll('input')[0]!
  const privateSwitch = (wrapper: VueWrapper) => wrapper.find('input[type="checkbox"]')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)
    vi.mocked(gitApi.connectGit).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the reuse toggle only when the pair has a connected repository', async () => {
    const without = await mountView(makeInstance(false))
    expect(without.wrapper.find('.git-connect-mode-toggle').exists()).toBe(false)
    without.wrapper.unmount()

    const withPair = await mountView(makeInstance(false, { subInstances: [pairedStaging()] }))
    expect(withPair.wrapper.find('.git-connect-mode-toggle').exists()).toBe(true)
    expect(withPair.wrapper.text()).toContain('https://example.test/pair.git')
    expect(withPair.wrapper.text()).toContain('heading.instance.advanced.git.repoMode.reuseHint')
    withPair.wrapper.unmount()
  })

  it('shows the manual fields when the reuse toggle is set to a different repository', async () => {
    const { wrapper } = await mountView(makeInstance(false, { subInstances: [pairedStaging()] }))

    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.findAll('.git-connect-mode-toggle button')[1]!.trigger('click')
    expect(urlInput(wrapper).exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the staging branch hint only for a parent or staging instance', async () => {
    const { wrapper } = await mountView(makeInstance(false, { parentInstance: pairedStaging() }))

    expect(wrapper.text()).toContain('heading.instance.advanced.git.repoMode.stagingBranchHint')
    wrapper.unmount()
  })

  it('does not send a request and shows the required message when the URL is empty', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('form.validation.required')
    wrapper.unmount()
  })

  it('treats a URL of spaces only as empty', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue(' '.repeat(3))
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('form.validation.required')
    wrapper.unmount()
  })

  it('clears the URL error when the URL changes', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('form.validation.required')

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await flushPromises()

    expect(wrapper.text()).not.toContain('form.validation.required')
    wrapper.unmount()
  })

  it('requires a token for a private repository and clears that error when the switch is turned off', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await privateSwitch(wrapper).setValue(true)
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('heading.instance.advanced.git.connect.token')
    expect(wrapper.text()).toContain('form.validation.required')

    await privateSwitch(wrapper).setValue(false)
    await flushPromises()

    expect(wrapper.text()).not.toContain('form.validation.required')
    wrapper.unmount()
  })

  it('sends the public payload and shows the success toast and refetches the status', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('  https://example.test/acme/shop.git  ')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).toHaveBeenCalledWith(9, {
      repo_url: 'https://example.test/acme/shop.git',
      auth_type: null,
      token: null,
    })
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.connect.synced' }),
    ])
    // One read on entry plus the silent refetch after the connect.
    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('says the files are unchanged when the site already has a Git checkout', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue({ ...statusResponse(false, false), local_repository_exists: true } as never)
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.connect.success' }),
    ])
    wrapper.unmount()
  })

  it('sends the pair repository id in reuse mode', async () => {
    const { wrapper } = await mountView(makeInstance(false, { subInstances: [pairedStaging()] }))

    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).toHaveBeenCalledWith(9, { git_repository_id: 77 })
    wrapper.unmount()
  })

  it('treats a 422 with connected true as connected: the sync message is a success toast', async () => {
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { connected: true, message: ' First sync failed. ' } } })
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'heading.instance.advanced.git.connect.partialSyncFailed' }),
    ])
    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('falls back to the plain success message when the 422 has no sync message', async () => {
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { connected: true, message: '  ' } } })
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.connect.success' }),
    ])
    wrapper.unmount()
  })

  it('shows the error toast for any other failure', async () => {
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { message: 'Bad token.' } } })
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'Bad token.' }),
    ])
    wrapper.unmount()
  })

  // The corner alert closes itself after a few seconds; the refusal has to stay on the field the answer names.
  const dismissAlerts = () => {
    const alerts = useAlertsStore()
    const active = alerts.activeAlerts
    for (const alert of active) {
      alerts.removeAlert(alert.id)
    }
  }

  const tokenInput = (wrapper: VueWrapper) => wrapper.findAll('.git-field input')[1]!
  const fieldText = (wrapper: VueWrapper, index: number) => wrapper.findAll('.git-field')[index]!.text()

  it('keeps a refused token under the Access token field after the alert is gone', async () => {
    const message = 'The repository refused this token. Check the token and that it can read this repository.'
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { message, errors: { token: [message] } } } })
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await privateSwitch(wrapper).setValue(true)
    await tokenInput(wrapper).setValue('ghp_x')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(fieldText(wrapper, 1)).toContain(message)
    expect(fieldText(wrapper, 0)).not.toContain(message)
    expect(urlInput(wrapper).element.value).toBe('https://example.test/acme/shop.git')
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: message })])

    dismissAlerts()
    expect(fieldText(wrapper, 1)).toContain(message)

    await tokenInput(wrapper).setValue('ghp_y')
    await flushPromises()
    expect(wrapper.text()).not.toContain(message)
    wrapper.unmount()
  })

  it('shows a refused address under the Repository URL field until the URL is edited', async () => {
    const message = 'The host cannot be reached from the panel.'
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { message, errors: { host: [message] } } } })
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://127.0.0.1/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(fieldText(wrapper, 0)).toContain(message)
    dismissAlerts()
    expect(fieldText(wrapper, 0)).toContain(message)

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await flushPromises()
    expect(wrapper.text()).not.toContain(message)
    wrapper.unmount()
  })

  it('shows the connect button as loading and locks the form while the request is pending', async () => {
    vi.mocked(gitApi.connectGit).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme/shop.git')
    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    const button = findButton(wrapper, connectLabel)
    expect(button.classes()).toContain('v-btn--loading')
    expect(button.attributes('disabled')).toBeDefined()
    expect(urlInput(wrapper).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('disables the connect button for an unsupported hosting', async () => {
    vi.mocked(gitApi.getGitStatus).mockRejectedValue({ response: { status: 422, data: { message: 'Git is not supported here.' } } })
    const { wrapper } = await mountView(makeInstance(false))

    expect(findButton(wrapper, connectLabel).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.git-connect-mode-toggle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the connect button without the manage_git privilege but keeps the form', async () => {
    const { wrapper } = await mountView(makeInstance(false, { manage: false }))

    expect(wrapper.findAll('button').some(node => node.text() === connectLabel)).toBe(false)
    expect(urlInput(wrapper).exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('GitView connect form, SSH address', () => {
  const connectLabel = 'heading.instance.advanced.git.connect.button'
  const generateLabel = 'button.onboarding.gitDeploy.generateDeployKey'
  const regenerateLabel = 'button.onboarding.gitDeploy.regenerateDeployKey'
  const sshHint = 'heading.onboarding.gitDeploy.repoUrl.sshHint'
  const sshRepo = 'git@example.test:acme.git'
  const urlInput = (wrapper: VueWrapper) => wrapper.findAll('input')[0]!
  const branchInput = (wrapper: VueWrapper) => wrapper.findAll('input').find(node => node.attributes('placeholder') === 'main')
  const privateSwitch = (wrapper: VueWrapper) => wrapper.find('input[type="checkbox"]')
  const hasButton = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').some(node => node.text() === label)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)
    vi.mocked(gitApi.createGitDeployKey).mockResolvedValue({ public_key: 'ssh-ed25519 AAAAC3 acme', fingerprint: 'SHA256:acme' })
    vi.mocked(gitApi.connectGit).mockResolvedValue({ branchMissing: false })
    vi.mocked(gitApi.getGitBranches).mockResolvedValue(['main', 'develop'])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hides the hint, the privacy switch and the connect button, and shows the branch field for an SSH address', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await flushPromises()

    expect(wrapper.text()).not.toContain(sshHint)
    expect(privateSwitch(wrapper).exists()).toBe(false)
    expect(hasButton(wrapper, connectLabel)).toBe(false)
    expect(branchInput(wrapper)).toBeDefined()
    expect(wrapper.text()).toContain('heading.onboarding.gitDeploy.branch.label')
    expect(hasButton(wrapper, generateLabel)).toBe(true)
    wrapper.unmount()
  })

  it('keeps the hint, the switch and the connect button for an https address', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await flushPromises()

    expect(wrapper.text()).toContain(sshHint)
    expect(privateSwitch(wrapper).exists()).toBe(true)
    expect(hasButton(wrapper, connectLabel)).toBe(true)
    expect(branchInput(wrapper)).toBeUndefined()
    expect(hasButton(wrapper, generateLabel)).toBe(false)
    wrapper.unmount()
  })

  it('shows the token field for an https address after the switch, and no branch field', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    await urlInput(wrapper).setValue('https://example.test/acme.git')
    await privateSwitch(wrapper).setValue(true)
    await flushPromises()

    expect(wrapper.text()).toContain('heading.instance.advanced.git.connect.token')
    expect(branchInput(wrapper)).toBeUndefined()
    wrapper.unmount()
  })

  it('starts the branch with main, and blocks the generate button with the required message when it is empty', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await flushPromises()
    expect(branchInput(wrapper)!.element).toHaveProperty('value', 'main')

    await branchInput(wrapper)!.setValue(' '.repeat(3))
    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()

    expect(gitApi.createGitDeployKey).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('form.validation.required')
    wrapper.unmount()
  })

  it('posts the key for the typed SSH address on click, and clears the branch error when the branch changes', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await branchInput(wrapper)!.setValue('')
    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('form.validation.required')

    await branchInput(wrapper)!.setValue('develop')
    await flushPromises()
    expect(wrapper.text()).not.toContain('form.validation.required')

    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()
    expect(gitApi.createGitDeployKey).toHaveBeenCalledWith(9, sshRepo)
    wrapper.unmount()
  })

  it('shows the key panel with Connect and deploy and Generate a new key, and hides the generate button', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('ssh-ed25519 AAAAC3 acme')
    expect(hasButton(wrapper, generateLabel)).toBe(false)
    expect(hasButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy')).toBe(true)
    expect(hasButton(wrapper, regenerateLabel)).toBe(true)
    wrapper.unmount()
  })

  it('shows the address error of a 422 on the URL field and no key panel', async () => {
    vi.mocked(gitApi.createGitDeployKey).mockRejectedValue({ response: { status: 422, data: { message: 'Bad address.', errors: { repo_url: ['Invalid repository address.'] } } } })
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Invalid repository address.')
    expect(wrapper.text()).not.toContain('ssh-ed25519 AAAAC3 acme')
    expect(hasButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy')).toBe(false)
    wrapper.unmount()
  })

  it('hides the key panel when the URL changes', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue(sshRepo)
    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()
    expect(hasButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy')).toBe(true)

    await urlInput(wrapper).setValue('git@example.test:other.git')
    await flushPromises()

    expect(hasButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy')).toBe(false)
    expect(hasButton(wrapper, generateLabel)).toBe(true)
    wrapper.unmount()
  })

  async function mountWithKey () {
    const mounted = await mountView(makeInstance(false))
    await urlInput(mounted.wrapper).setValue(sshRepo)
    await findButton(mounted.wrapper, generateLabel).trigger('click')
    await flushPromises()
    return mounted
  }

  it('posts the repository address and the branch of an SSH connect, and reloads the instance on success', async () => {
    const { wrapper } = await mountWithKey()
    await branchInput(wrapper)!.setValue(' develop ')

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).toHaveBeenCalledWith(9, { repo_url: sshRepo, branch: 'develop' })
    expect(wrapper.emitted('reload-instance')).toHaveLength(1)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.connect.synced' }),
    ])
    wrapper.unmount()
  })

  it('shows an SSH connect error under the key panel and no toast', async () => {
    vi.mocked(gitApi.connectGit).mockRejectedValue({ response: { status: 422, data: { message: 'Permission denied.' } } })
    const { wrapper } = await mountWithKey()

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()

    expect(wrapper.find('.deploy-key-panel .text-error').text()).toBe('Permission denied.')
    expect(useAlertsStore().activeAlerts).toEqual([])
    expect(wrapper.emitted('reload-instance')).toBeUndefined()
    wrapper.unmount()
  })

  it('clears the SSH error when the next connect starts', async () => {
    vi.mocked(gitApi.connectGit).mockRejectedValueOnce({ response: { status: 422, data: { message: 'Permission denied.' } } })
    const { wrapper } = await mountWithKey()
    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()
    expect(wrapper.find('.deploy-key-panel .text-error').exists()).toBe(true)

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()

    expect(wrapper.find('.deploy-key-panel .text-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('a missing branch shows the branch error, reads the branch list and opens the branch dialog', async () => {
    vi.mocked(gitApi.connectGit).mockResolvedValue({ branchMissing: true })
    const { wrapper } = await mountWithKey()
    await branchInput(wrapper)!.setValue('feature')

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).toHaveBeenCalledWith(9, { repo_url: sshRepo, branch: 'feature' })
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'heading.onboarding.gitDeploy.branchMissing' }),
    ])
    expect(gitApi.getGitBranches).toHaveBeenCalledWith(9)
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(true)
    expect(wrapper.findComponent(ActionModalHost).props('modal')?.type).toBe('git-branch')
    expect(wrapper.emitted('reload-instance')).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens the redeploy modal after an SSH connect once the reloaded instance shows the repository connected', async () => {
    const { wrapper } = await mountWithKey()

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()
    expect(redeploy.open).not.toHaveBeenCalled()

    await wrapper.setProps({ instance: makeInstance(true) })
    await flushPromises()

    expect(redeploy.open).toHaveBeenCalledTimes(1)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.connect.synced' }),
    ])
    wrapper.unmount()
  })

  it('opens the redeploy modal after 5 s when the instance is not reloaded as connected', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { wrapper } = await mountWithKey()
      await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
      await flushPromises()

      await vi.advanceTimersByTimeAsync(4999)
      expect(redeploy.open).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(redeploy.open).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not open the redeploy modal when the SSH connect finds no branch', async () => {
    vi.mocked(gitApi.connectGit).mockResolvedValue({ branchMissing: true })
    const { wrapper } = await mountWithKey()
    await branchInput(wrapper)!.setValue('feature')

    await findButton(wrapper, 'button.onboarding.gitDeploy.connectAndDeploy').trigger('click')
    await flushPromises()
    await wrapper.setProps({ instance: makeInstance(true) })
    await flushPromises()

    expect(redeploy.open).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not open the redeploy modal after an https connect', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    await urlInput(wrapper).setValue('https://example.test/acme.git')

    await findButton(wrapper, connectLabel).trigger('click')
    await flushPromises()

    expect(gitApi.connectGit).toHaveBeenCalled()
    expect(redeploy.open).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('passes a reload from the redeploy modal to the frame and reads the status again', async () => {
    const { wrapper } = await mountView(makeInstance(false))
    const statusCalls = vi.mocked(gitApi.getGitStatus).mock.calls.length

    wrapper.findComponent({ name: 'GitRedeployModal' }).vm.$emit('reload-instance')
    await flushPromises()

    expect(wrapper.emitted('reload-instance')).toHaveLength(1)
    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBeGreaterThan(statusCalls)
    wrapper.unmount()
  })
})

describe('GitView branch, last commit and auto-deploy', () => {
  const manageLabel = 'button.manage'
  const checkLabel = 'heading.instance.advanced.git.lastCommit.checkUpdates'

  function connectedStatus (overrides: Record<string, unknown> = {}) {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: 'https://example.test/acme.git',
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      last_deployed_commit_hash: 'abc1234def567',
      last_deployed_commit_message: 'Fix the footer',
      last_deployed_commit_at: '2026-10-19T10:15:30Z',
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
      ...overrides,
    }
  }

  const buttonLabelled = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(node => node.text() === label)
  const modalHost = (wrapper: VueWrapper) => wrapper.findComponent(ActionModalHost)
  const autoSwitch = (wrapper: VueWrapper) => wrapper.findComponent({ name: 'VSwitch' })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus() as never)
    vi.mocked(gitApi.getGitBranches).mockResolvedValue(['main', 'develop'])
    vi.mocked(gitApi.changeBranch).mockResolvedValue(undefined)
    vi.mocked(gitApi.setAutoDeploy).mockResolvedValue(connectedStatus({ auto_deploy_enabled: true }) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens the branch dialog only after the branch list is read, and Manage shows the loader meanwhile', async () => {
    let resolveBranches: (value: string[]) => void = () => {}
    vi.mocked(gitApi.getGitBranches).mockReturnValueOnce(new Promise(resolve => {
      resolveBranches = resolve
    }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, manageLabel).trigger('click')
    await flushPromises()
    const manage = findButton(wrapper, manageLabel)
    expect(manage.classes()).toContain('v-btn--loading')
    expect(modalHost(wrapper).props('open')).toBe(false)

    resolveBranches(['main', 'develop'])
    await flushPromises()
    expect(findButton(wrapper, manageLabel).classes()).not.toContain('v-btn--loading')
    expect(modalHost(wrapper).props('open')).toBe(true)
    expect(modalHost(wrapper).props('modal')?.type).toBe('git-branch')
    expect(modalHost(wrapper).props('modal')?.fields[0]).toEqual(expect.objectContaining({ type: 'combobox', name: 'branch' }))
    wrapper.unmount()
  })

  it('falls back to a text field without a toast when the branch list cannot be read', async () => {
    vi.mocked(gitApi.getGitBranches).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Boom.' } } })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, manageLabel).trigger('click')
    await flushPromises()

    expect(modalHost(wrapper).props('modal')?.fields[0]).toEqual(expect.objectContaining({ type: 'text', name: 'branch' }))
    expect(useAlertsStore().activeAlerts).toEqual([])
    wrapper.unmount()
  })

  it('changes the branch from the dialog, closes it and refetches the status and the logs', async () => {
    const { wrapper } = await mountView(makeInstance(true))
    const statusCalls = vi.mocked(gitApi.getGitStatus).mock.calls.length
    const logsCalls = vi.mocked(gitApi.getGitLogs).mock.calls.length

    await findButton(wrapper, manageLabel).trigger('click')
    await flushPromises()
    modalHost(wrapper).vm.$emit('update:values', { branch: 'develop' })
    modalHost(wrapper).vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.changeBranch).toHaveBeenCalledWith(9, 'develop')
    expect(modalHost(wrapper).props('open')).toBe(false)
    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBe(statusCalls + 1)
    expect(vi.mocked(gitApi.getGitLogs).mock.calls.length).toBe(logsCalls + 1)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.branch.success' }),
    ])
    wrapper.unmount()
  })

  it('keeps the branch dialog open and shows the error toast when the change fails', async () => {
    vi.mocked(gitApi.changeBranch).mockRejectedValue({ response: { status: 422, data: { message: 'No such branch.' } } })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, manageLabel).trigger('click')
    await flushPromises()
    modalHost(wrapper).vm.$emit('button', 'submit')
    await flushPromises()

    expect(modalHost(wrapper).props('open')).toBe(true)
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'No such branch.' })])
    wrapper.unmount()
  })

  it('swaps the branch dialog for the dirty-tree dialog when the tree has local changes', async () => {
    vi.mocked(gitApi.changeBranch).mockRejectedValueOnce({ response: { status: 422, data: { error_code: 'git_working_tree_dirty', message: 'Git said no.' } } })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, manageLabel).trigger('click')
    await flushPromises()
    modalHost(wrapper).vm.$emit('update:values', { branch: 'develop' })
    modalHost(wrapper).vm.$emit('button', 'submit')
    await flushPromises()

    // The way out of the changes that block the switch, with no error toast on the way.
    expect(modalHost(wrapper).props('open')).toBe(true)
    expect(modalHost(wrapper).props('modal')?.type).toBe('git-pull-dirty')
    expect(useAlertsStore().activeAlerts).toEqual([])
    wrapper.unmount()
  })

  it('reads the status again on check for updates, without the logs', async () => {
    const { wrapper } = await mountView(makeInstance(true))
    const statusCalls = vi.mocked(gitApi.getGitStatus).mock.calls.length
    const logsCalls = vi.mocked(gitApi.getGitLogs).mock.calls.length

    await findButton(wrapper, checkLabel).trigger('click')
    await flushPromises()

    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBe(statusCalls + 1)
    expect(vi.mocked(gitApi.getGitLogs).mock.calls.length).toBe(logsCalls)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.check.success' }),
    ])
    wrapper.unmount()
  })

  it('shows check for updates as loading and disabled while the read is pending', async () => {
    const { wrapper } = await mountView(makeInstance(true))
    vi.mocked(gitApi.getGitStatus).mockReturnValue(new Promise(() => {}) as never)

    await findButton(wrapper, checkLabel).trigger('click')
    await flushPromises()

    const button = findButton(wrapper, checkLabel)
    expect(button.classes()).toContain('v-btn--loading')
    expect(button.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('disables Manage while the local repository is missing, and keeps check for updates enabled', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ local_repository_exists: false }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(findButton(wrapper, manageLabel).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, checkLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('turns auto-deploy on with the status from the response', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    autoSwitch(wrapper).vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(gitApi.setAutoDeploy).toHaveBeenCalledWith(9, true)
    expect(autoSwitch(wrapper).props('modelValue')).toBe(true)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.autoDeploy.success' }),
    ])
    wrapper.unmount()
  })

  it('refetches the status after a failed switch, so the switch goes back to the server state', async () => {
    vi.mocked(gitApi.setAutoDeploy).mockRejectedValue({ response: { status: 403, data: { message: 'Denied.' } } })
    const { wrapper } = await mountView(makeInstance(true))
    const statusCalls = vi.mocked(gitApi.getGitStatus).mock.calls.length

    autoSwitch(wrapper).vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBe(statusCalls + 1)
    expect(autoSwitch(wrapper).props('modelValue')).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Denied.' })])
    wrapper.unmount()
  })

  // A refused enable left the control's own checkbox checked (the value it is bound to did not change, so `v-switch` never rewrote it):
  // the card read "off" while the input - and a screen reader - read "on".
  it('puts the switch input itself back to the saved state when the enable is refused', async () => {
    vi.mocked(gitApi.setAutoDeploy).mockRejectedValue({ response: { status: 422, data: { message: 'Could not register a webhook.' } } })
    const { wrapper } = await mountView(makeInstance(true))
    const input = autoSwitch(wrapper).find('input[type="checkbox"]')
    expect((input.element as HTMLInputElement).checked).toBe(false)

    await input.setValue(true)
    await flushPromises()

    expect(gitApi.setAutoDeploy).toHaveBeenCalledWith(9, true)
    expect((input.element as HTMLInputElement).checked).toBe(false)
    expect(autoSwitch(wrapper).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('disables the switch and shows the in-progress note while the auto-deploy is running', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({
      auto_deploy_enabled: true,
      async_status: { git_auto_deploy: 'in_progress' },
    }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(autoSwitch(wrapper).props('disabled')).toBe(true)
    expect(wrapper.text()).toContain('heading.instance.advanced.git.autoDeploy.inProgress')
    wrapper.unmount()
  })

  it('hides Manage, check for updates and the switch without the manage_git privilege', async () => {
    const { wrapper } = await mountView(makeInstance(true, { manage: false }))

    expect(buttonLabelled(wrapper, manageLabel)).toBeUndefined()
    expect(buttonLabelled(wrapper, checkLabel)).toBeUndefined()
    expect(wrapper.findComponent({ name: 'VSwitch' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('heading.instance.advanced.git.branch.title')
    wrapper.unmount()
  })

  it('shows the setting cards of a connected repository with their titles, subtitles and actions', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.findAll('h6').map(heading => heading.text())).toEqual(expect.arrayContaining([
      'heading.instance.advanced.git.connect.title',
      'heading.instance.advanced.git.branch.title',
      'heading.instance.advanced.git.lastCommit.title',
      'heading.instance.advanced.git.autoDeploy.title',
      'heading.instance.advanced.git.pull.card.title',
      'heading.instance.advanced.git.push.card.title',
    ]))
    expect(wrapper.text()).toContain('heading.instance.advanced.git.connect.subtitle')
    expect(wrapper.text()).toContain('heading.instance.advanced.git.branch.subtitle')
    expect(wrapper.text()).toContain('heading.instance.advanced.git.lastCommit.subtitle')
    expect(buttonLabelled(wrapper, manageLabel)).toBeDefined()
    expect(buttonLabelled(wrapper, checkLabel)).toBeDefined()
    wrapper.unmount()
  })

  it('shows the empty last-commit copy when no commit has been deployed', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ last_deployed_commit_hash: null, last_deployed_commit_message: null, last_deployed_commit_at: null }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).toContain('heading.instance.advanced.git.lastCommit.empty')
    expect(wrapper.text()).not.toContain('heading.instance.advanced.git.lastCommit.hash')
    wrapper.unmount()
  })
})

describe('GitView connected repository', () => {
  const disconnectLabel = 'button.disconnect.default'
  const updateTokenLabel = 'heading.instance.advanced.git.connection.updateToken'

  function connectedStatus (overrides: Record<string, unknown> = {}) {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: 'https://example.test/acme.git',
      auth_type: 'pat',
      commits_behind: 0,
      commits_ahead: 0,
      connection_health: { status: 'ok', reason: null },
      async_status: { git_auto_deploy: null },
      ...overrides,
    }
  }

  function hasButton (wrapper: VueWrapper, label: string): boolean {
    return wrapper.findAll('button').some(node => node.text() === label)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus() as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('links an https repository without its .git suffix', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    const link = wrapper.find('a[href="https://example.test/acme"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('https://example.test/acme.git')
    wrapper.unmount()
  })

  it('shows an unknown repository address as plain text', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ repo_url: 'C:/repos/acme' }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.find('a[href]').exists()).toBe(false)
    expect(wrapper.text()).toContain('C:/repos/acme')
    wrapper.unmount()
  })

  it('shows Disconnect without the manage_git privilege, and Disconnect is not loading or disabled by default', async () => {
    const { wrapper } = await mountView(makeInstance(true, { manage: false }))

    const button = findButton(wrapper, disconnectLabel)
    expect(button.classes()).not.toContain('v-btn--loading')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(hasButton(wrapper, 'heading.instance.advanced.git.connect.button')).toBe(false)
    wrapper.unmount()
  })

  it('hides Disconnect and Connect for a repository managed by deploy, with the manage_git privilege', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ managed_by: 'deploy' }) as never)
    const { wrapper } = await mountView(makeInstance(true, { manage: true }))

    expect(hasButton(wrapper, disconnectLabel)).toBe(false)
    expect(hasButton(wrapper, 'heading.instance.advanced.git.connect.button')).toBe(false)
    wrapper.unmount()
  })

  it('hides Disconnect for a repository managed by deploy, without the manage_git privilege', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ managed_by: 'deploy' }) as never)
    const { wrapper } = await mountView(makeInstance(true, { manage: false }))

    expect(hasButton(wrapper, disconnectLabel)).toBe(false)
    wrapper.unmount()
  })

  it.each(['site_git', null])('keeps Disconnect for a repository with managed_by %s', async managedBy => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ managed_by: managedBy }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(hasButton(wrapper, disconnectLabel)).toBe(true)
    wrapper.unmount()
  })

  it('opens the disconnect dialog, and confirming disconnects and refetches the status silently', async () => {
    const { wrapper } = await mountView(makeInstance(true))
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ connected: false }) as never)
    vi.mocked(gitApi.disconnectGit).mockResolvedValue(undefined)
    const callsBefore = vi.mocked(gitApi.getGitStatus).mock.calls.length

    await findButton(wrapper, disconnectLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-disconnect')

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.disconnectGit).toHaveBeenCalledWith(9)
    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBe(callsBefore + 1)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.disconnect.success' }),
    ])
    expect(host.props('open')).toBe(false)
    wrapper.unmount()
  })

  it('closes the disconnect dialog after a failed request and shows one error toast, without a refetch', async () => {
    const { wrapper } = await mountView(makeInstance(true))
    vi.mocked(gitApi.disconnectGit).mockRejectedValue({ response: { status: 422, data: { message: 'Git is managed by deploy.' } } })
    const callsBefore = vi.mocked(gitApi.getGitStatus).mock.calls.length

    await findButton(wrapper, disconnectLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-disconnect')

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.disconnectGit).toHaveBeenCalledWith(9)
    expect(host.props('open')).toBe(false)
    expect(vi.mocked(gitApi.getGitStatus).mock.calls.length).toBe(callsBefore)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'Git is managed by deploy.' }),
    ])
    wrapper.unmount()
  })

  it('shows the health alert with the copy of its reason', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ connection_health: { status: 'error', reason: 'network' } }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).toContain('heading.instance.advanced.git.connection.error.network')
    wrapper.unmount()
  })

  it('hides the health alert while the connection is ok', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).not.toContain('heading.instance.advanced.git.connection.error')
    wrapper.unmount()
  })

  it('shows the update token link only for a token problem and with the privilege', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ connection_health: { status: 'error', reason: 'token' } }) as never)
    const withPrivilege = await mountView(makeInstance(true))
    expect(hasButton(withPrivilege.wrapper, updateTokenLabel)).toBe(true)
    withPrivilege.wrapper.unmount()

    const withoutPrivilege = await mountView(makeInstance(true, { manage: false }))
    expect(hasButton(withoutPrivilege.wrapper, updateTokenLabel)).toBe(false)
    withoutPrivilege.wrapper.unmount()

    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ connection_health: { status: 'error', reason: 'network' } }) as never)
    const otherReason = await mountView(makeInstance(true))
    expect(hasButton(otherReason.wrapper, updateTokenLabel)).toBe(false)
    otherReason.wrapper.unmount()
  })

  it('opens the token dialog from the update token link', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ connection_health: { status: 'error', reason: 'token' } }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, updateTokenLabel).trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(true)
    expect(wrapper.findComponent(ActionModalHost).props('modal')?.type).toBe('git-token')
    wrapper.unmount()
  })

  // A difference from legacy: the Access token card, as the Branch card (the Branch card's Manage comes first).
  const manageButtons = (wrapper: VueWrapper) => wrapper.findAll('button').filter(node => node.text() === 'button.manage')

  it('shows the Access token card with whether a token is saved, and its Manage only with the privilege', async () => {
    const saved = await mountView(makeInstance(true))
    expect(saved.wrapper.text()).toContain('heading.instance.advanced.git.token.title')
    expect(saved.wrapper.text()).toContain('heading.instance.advanced.git.token.saved')
    expect(manageButtons(saved.wrapper)).toHaveLength(2)
    saved.wrapper.unmount()

    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ auth_type: null }) as never)
    const missing = await mountView(makeInstance(true))
    expect(missing.wrapper.text()).toContain('heading.instance.advanced.git.token.missing')
    missing.wrapper.unmount()

    const withoutPrivilege = await mountView(makeInstance(true, { manage: false }))
    expect(withoutPrivilege.wrapper.text()).toContain('heading.instance.advanced.git.token.missing')
    expect(manageButtons(withoutPrivilege.wrapper)).toHaveLength(0)
    withoutPrivilege.wrapper.unmount()
  })

  it('has no Access token card for an SSH repository', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ auth_type: null, repo_url: 'git@example.test:acme/site.git' }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).not.toContain('heading.instance.advanced.git.token.title')
    expect(manageButtons(wrapper)).toHaveLength(1)
    wrapper.unmount()
  })

  it('saves the token from the dialog, replaces the status with the response and closes it', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(connectedStatus({ auth_type: null }) as never)
    vi.mocked(gitApi.updateGitCredentials).mockResolvedValue(connectedStatus({ repo_url: 'https://example.test/new.git' }) as never)
    const { wrapper } = await mountView(makeInstance(true))
    const host = wrapper.findComponent(ActionModalHost)

    await manageButtons(wrapper)[1]!.trigger('click')
    await flushPromises()
    expect(host.props('modal')?.type).toBe('git-token')

    host.vm.$emit('update:values', { token: '  new-token  ' })
    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.updateGitCredentials).toHaveBeenCalledWith(9, 'new-token')
    expect(host.props('open')).toBe(false)
    expect(wrapper.text()).toContain('https://example.test/new.git')
    expect(wrapper.text()).toContain('heading.instance.advanced.git.token.saved')
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.credentials.success' }),
    ])
    wrapper.unmount()
  })

  it('sends nothing for an empty token, and keeps the dialog open with the error toast when saving fails', async () => {
    vi.mocked(gitApi.updateGitCredentials).mockRejectedValue({ response: { status: 422, data: { message: 'Bad token.' } } })
    const { wrapper } = await mountView(makeInstance(true))
    const host = wrapper.findComponent(ActionModalHost)

    await manageButtons(wrapper)[1]!.trigger('click')
    await flushPromises()
    host.vm.$emit('update:values', { token: ' '.repeat(3) })
    host.vm.$emit('button', 'submit')
    await flushPromises()
    expect(gitApi.updateGitCredentials).not.toHaveBeenCalled()

    host.vm.$emit('update:values', { token: 'bad' })
    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(host.props('open')).toBe(true)
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Bad token.' })])
    wrapper.unmount()
  })
})

describe('GitView pull and push cards', () => {
  const pullLabel = 'button.git.pull'
  const pushLabel = 'button.git.push'
  const pullFirstHint = 'heading.instance.advanced.git.push.pullFirstHint'

  function syncedStatus (overrides: Record<string, unknown> = {}) {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: 'https://example.test/acme.git',
      commits_behind: 0,
      commits_ahead: 0,
      connection_health: { status: 'ok', reason: null },
      async_status: { git_auto_deploy: null },
      ...overrides,
    }
  }

  function gitRejection (code: string) {
    return { response: { status: 422, data: { error_code: code, message: 'Git said no.' } } }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // `mockReset` drops the pending implementations of the loading tests, which would otherwise hang the later requests.
    vi.mocked(gitApi.pullGit).mockReset().mockResolvedValue(undefined)
    vi.mocked(gitApi.pushGit).mockReset().mockResolvedValue(false)
    vi.mocked(gitApi.revertGit).mockReset().mockResolvedValue(undefined)
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(syncedStatus() as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('disables Push and shows the pull-first hint while the remote is ahead of the site', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(syncedStatus({ commits_behind: 2 }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(findButton(wrapper, pushLabel).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, pullLabel).attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain(pullFirstHint)
    wrapper.unmount()
  })

  it('sends no push while the remote is ahead, even when the button is clicked', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(syncedStatus({ commits_behind: 2 }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pushLabel).trigger('click')
    await flushPromises()

    expect(gitApi.pushGit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the push-to-live hint on the Pull card for a pair and keeps Push enabled when in sync', async () => {
    const { wrapper } = await mountView(makeInstance(true, { parentInstance: { id: 1 } }))

    expect(wrapper.text()).toContain('heading.instance.advanced.git.pull.pushToLiveHint')
    expect(findButton(wrapper, pushLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('hides the Pull and Push buttons without the manage_git privilege', async () => {
    const { wrapper } = await mountView(makeInstance(true, { manage: false }))

    const labels = wrapper.findAll('button').map(node => node.text())
    expect(labels).not.toContain(pullLabel)
    expect(labels).not.toContain(pushLabel)
    wrapper.unmount()
  })

  it('locks Pull and Push while the setup check runs', async () => {
    vi.mocked(gitApi.getGitStatus)
      .mockResolvedValueOnce(syncedStatus({ has_synced_once: false }) as never)
      .mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))

    expect(findButton(wrapper, pullLabel).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, pushLabel).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('shows the Pull button as loading while the pull request is pending', async () => {
    vi.mocked(gitApi.pullGit).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()

    expect(gitApi.pullGit).toHaveBeenCalledWith(9, undefined)
    expect(findButton(wrapper, pullLabel).classes()).toContain('v-btn--loading')
    wrapper.unmount()
  })

  it('opens the dirty-tree dialog when the pull finds local changes, and Force pulls with its strategy', async () => {
    vi.mocked(gitApi.pullGit).mockRejectedValueOnce(gitRejection('git_working_tree_dirty'))
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-pull-dirty')

    host.vm.$emit('button', 'force')
    await flushPromises()

    expect(gitApi.pullGit).toHaveBeenLastCalledWith(9, 'force')
    expect(host.props('open')).toBe(false)
    wrapper.unmount()
  })

  it('Revert in the dirty-tree dialog reverts and closes the dialog', async () => {
    vi.mocked(gitApi.pullGit).mockRejectedValueOnce(gitRejection('git_working_tree_dirty'))
    vi.mocked(gitApi.revertGit).mockResolvedValue(undefined)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    host.vm.$emit('button', 'revert')
    await flushPromises()

    expect(gitApi.revertGit).toHaveBeenCalledWith(9)
    expect(host.props('open')).toBe(false)
    wrapper.unmount()
  })

  it('a missing remote branch opens the push-first dialog, and its confirm pushes', async () => {
    vi.mocked(gitApi.pullGit).mockRejectedValueOnce(gitRejection('git_remote_branch_missing'))
    vi.mocked(gitApi.pushGit).mockResolvedValue(false)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-push-first')

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.pushGit).toHaveBeenCalledWith(9)
    wrapper.unmount()
  })
})

describe('GitView banners', () => {
  const driftBanner = 'heading.instance.advanced.git.drift.banner'
  const driftPush = 'heading.instance.advanced.git.drift.push'
  const driftPullFirst = 'heading.instance.advanced.git.drift.pullFirst'
  const driftRevert = 'heading.instance.advanced.git.drift.revert'
  const driftIgnore = 'heading.instance.advanced.git.drift.ignore'
  const repairLabel = 'heading.instance.advanced.git.localRepoMissing.repair'
  const setupMessage = 'heading.instance.advanced.git.setupBanner.message'
  const setupChecking = 'heading.instance.advanced.git.setupBanner.checking'
  const setupPull = 'heading.instance.advanced.git.setupBanner.pull'
  const setupPullBehind = 'heading.instance.advanced.git.setupBanner.pullBehind'
  const setupPush = 'heading.instance.advanced.git.setupBanner.push'
  const sameBranchStaging = 'heading.instance.advanced.git.setupBanner.sameBranchStaging'
  const changeBranch = 'heading.instance.advanced.git.setupBanner.changeBranch'

  function bannerStatus (overrides: Record<string, unknown> = {}) {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: 'https://example.test/acme.git',
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      show_drift_banner: false,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      async_status: { git_auto_deploy: null },
      ...overrides,
    }
  }

  function buttonLabels (wrapper: VueWrapper): string[] {
    return wrapper.findAll('button').map(node => node.text())
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitStatus).mockReset().mockResolvedValue(bannerStatus() as never)
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.ignoreGitDrift).mockReset().mockResolvedValue(undefined)
    vi.mocked(gitApi.repairGit).mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('offers Push on the drift banner when the remote is not ahead, and Pull first when it is', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ show_drift_banner: true }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).toContain(driftBanner)
    expect(buttonLabels(wrapper)).toContain(driftPush)
    expect(buttonLabels(wrapper)).not.toContain(driftPullFirst)
    wrapper.unmount()

    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ show_drift_banner: true, commits_behind: 2 }) as never)
    const behind = await mountView(makeInstance(true))

    expect(buttonLabels(behind.wrapper)).toContain(driftPullFirst)
    expect(buttonLabels(behind.wrapper)).not.toContain(driftPush)
    behind.wrapper.unmount()
  })

  it('sends the ignore request for the drift banner and reads the status silently', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ show_drift_banner: true }) as never)
    const { wrapper } = await mountView(makeInstance(true))
    vi.mocked(gitApi.getGitStatus).mockClear()

    await findButton(wrapper, driftIgnore).trigger('click')
    await flushPromises()

    expect(gitApi.ignoreGitDrift).toHaveBeenCalledWith(9)
    expect(gitApi.getGitStatus).toHaveBeenCalledTimes(1)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'notification.instance.git.drift.ignore.success' }),
    ])
    wrapper.unmount()
  })

  it('locks the drift Push and Revert while the local repository is missing, but keeps Ignore and Repair', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ show_drift_banner: true, local_repository_exists: false }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(findButton(wrapper, driftPush).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, driftRevert).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, driftIgnore).attributes('disabled')).toBeUndefined()
    expect(findButton(wrapper, repairLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('offers Push on the setup banner when the site is ahead, and Pull with the count when the remote is ahead', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ has_synced_once: false, commits_ahead: 2 }) as never)
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).toContain(setupMessage)
    expect(buttonLabels(wrapper)).toContain(setupPush)
    wrapper.unmount()

    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ has_synced_once: false, commits_behind: 3 }) as never)
    const behind = await mountView(makeInstance(true))

    expect(buttonLabels(behind.wrapper)).toContain(setupPullBehind)
    expect(buttonLabels(behind.wrapper)).not.toContain(setupPush)
    behind.wrapper.unmount()
  })

  it('shows the checking copy and no setup button while the setup check runs', async () => {
    vi.mocked(gitApi.getGitStatus)
      .mockResolvedValueOnce(bannerStatus({ has_synced_once: false, commits_ahead: 2 }) as never)
      .mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))

    expect(wrapper.text()).toContain(setupChecking)
    expect(buttonLabels(wrapper)).not.toContain(setupPush)
    expect(buttonLabels(wrapper)).not.toContain(setupPull)
    wrapper.unmount()
  })

  it('warns about the branch shared with the pair, with the change-branch button for a manager', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({ has_synced_once: false, pair_branch: 'main' }) as never)
    const { wrapper } = await mountView(makeInstance(true, { parentInstance: { id: 1 } }))

    expect(wrapper.text()).toContain(sameBranchStaging)
    expect(buttonLabels(wrapper)).toContain(changeBranch)
    wrapper.unmount()
  })

  it('shows the banners without any button when the user lacks manage_git', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(bannerStatus({
      show_drift_banner: true,
      local_repository_exists: false,
      has_synced_once: false,
      commits_ahead: 2,
    }) as never)
    const { wrapper } = await mountView(makeInstance(true, { manage: false }))

    expect(wrapper.text()).toContain(driftBanner)
    expect(wrapper.text()).toContain(setupMessage)
    const labels = buttonLabels(wrapper)
    for (const label of [driftPush, driftPullFirst, driftRevert, driftIgnore, repairLabel, setupPush, setupPull]) {
      expect(labels).not.toContain(label)
    }
    wrapper.unmount()
  })
})

describe('GitView deploy key, a key made before the repository is connected', () => {
  const cardTitle = 'heading.onboarding.gitDeploy.auth.deployKey.label'
  const key = { public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 early', fingerprint: 'SHA256:early' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the key the Engine answered for a project without a repository, without creating one', async () => {
    vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(key)
    const { wrapper } = await mountView(makeInstance(false))

    expect(gitApi.getGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.text()).toContain(cardTitle)
    expect(wrapper.text()).toContain('SHA256:early')
    expect(gitApi.createGitDeployKey).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the card hidden when the project has no key and no repository', async () => {
    const { wrapper } = await mountView(makeInstance(false))

    expect(gitApi.getGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.text()).not.toContain(cardTitle)
    expect(gitApi.createGitDeployKey).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not read the key without the git privilege', async () => {
    const { wrapper } = await mountView(makeInstance(false, { manage: false }))

    expect(gitApi.getGitDeployKey).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain(cardTitle)
    wrapper.unmount()
  })
})

describe('GitView deploy key, empty state', () => {
  const generateLabel = 'button.onboarding.gitDeploy.generateDeployKey'
  const missingText = 'heading.onboarding.gitDeploy.auth.deployKey.missing'
  const sshRepo = 'git@example.test:acme.git'

  function sshStatus () {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: sshRepo,
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(sshStatus() as never)
    vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the missing-key message and the generate button when the repository has no key', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    expect(gitApi.getGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.text()).toContain(missingText)
    expect(findButton(wrapper, generateLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('posts the key for the stored repository address on click and then shows the key', async () => {
    vi.mocked(gitApi.createGitDeployKey).mockResolvedValue({
      public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 acme',
      fingerprint: 'SHA256:acme',
    })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()

    expect(gitApi.createGitDeployKey).toHaveBeenCalledWith(9, sshRepo)
    expect(wrapper.text()).not.toContain(missingText)
    expect(wrapper.text()).toContain('SHA256:acme')
    wrapper.unmount()
  })
})

describe('GitView deploy key, loading state', () => {
  const missingText = 'heading.onboarding.gitDeploy.auth.deployKey.missing'
  const sshRepo = 'git@example.test:acme.git'

  function sshStatus () {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: sshRepo,
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(sshStatus() as never)
    vi.mocked(gitApi.getGitDeployKey).mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the skeleton in the key card while the key request is pending', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    expect(gitApi.getGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.text()).not.toContain(missingText)
    wrapper.unmount()
  })
})

describe('GitView deploy key, load error state', () => {
  const loadFailedText = 'heading.onboarding.gitDeploy.auth.deployKey.loadFailed'
  const missingText = 'heading.onboarding.gitDeploy.auth.deployKey.missing'
  const retryLabel = 'button.retry'
  const sshRepo = 'git@example.test:acme.git'

  function sshStatus () {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: sshRepo,
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(sshStatus() as never)
    vi.mocked(gitApi.getGitDeployKey).mockRejectedValue(new Error('500'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the load-failed message and Retry, not the missing-key copy, when the key request fails', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    expect(gitApi.getGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.text()).toContain(loadFailedText)
    expect(wrapper.text()).not.toContain(missingText)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    expect(findButton(wrapper, retryLabel).exists()).toBe(true)
    wrapper.unmount()
  })

  it('repeats the key read on Retry and shows the key when it loads', async () => {
    vi.mocked(gitApi.getGitDeployKey).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({
      public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 acme',
      fingerprint: 'SHA256:acme',
    })
    const { wrapper } = await mountView(makeInstance(true))
    expect(wrapper.text()).toContain(loadFailedText)

    await findButton(wrapper, retryLabel).trigger('click')
    await flushPromises()

    expect(gitApi.getGitDeployKey).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain(loadFailedText)
    expect(wrapper.text()).toContain('SHA256:acme')
    wrapper.unmount()
  })
})

describe('GitView deploy key, delete and rotate dialogs', () => {
  const deleteLabel = 'button.onboarding.gitDeploy.deleteDeployKey'
  const regenerateLabel = 'button.onboarding.gitDeploy.regenerateDeployKey'
  const missingText = 'heading.onboarding.gitDeploy.auth.deployKey.missing'
  const sshRepo = 'git@example.test:acme.git'
  const oldKey = { public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 old', fingerprint: 'SHA256:old' }
  const newKey = { public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 new', fingerprint: 'SHA256:new' }

  function sshStatus () {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: sshRepo,
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(sshStatus() as never)
    vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(oldKey)
    vi.mocked(gitApi.deleteGitDeployKey).mockResolvedValue(undefined)
    vi.mocked(gitApi.createGitDeployKey).mockResolvedValue(newKey)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('confirming the delete dialog deletes the key, shows the missing copy and closes the dialog', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, deleteLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-deploy-key-delete')

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.deleteGitDeployKey).toHaveBeenCalledWith(9)
    expect(wrapper.text()).toContain(missingText)
    expect(wrapper.text()).not.toContain('SHA256:old')
    expect(host.props('open')).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'heading.onboarding.gitDeploy.auth.deployKey.deleted' }),
    ])
    wrapper.unmount()
  })

  it('closes the delete dialog after a failed delete and shows the error toast, keeping the key', async () => {
    vi.mocked(gitApi.deleteGitDeployKey).mockRejectedValue({ response: { status: 500, data: { message: 'Boom.' } } })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, deleteLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(host.props('open')).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'Boom.' }),
    ])
    wrapper.unmount()
  })

  it('confirming the rotate dialog deletes the key, posts a new one for the stored address and shows it', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, regenerateLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    expect(host.props('modal')?.type).toBe('git-deploy-key-rotate')

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(gitApi.deleteGitDeployKey).toHaveBeenCalledWith(9)
    expect(gitApi.createGitDeployKey).toHaveBeenCalledWith(9, sshRepo)
    expect(wrapper.text()).toContain('SHA256:new')
    expect(wrapper.text()).not.toContain('SHA256:old')
    expect(host.props('open')).toBe(false)
    wrapper.unmount()
  })

  it('closes the rotate dialog after a failed post, shows the error toast and reads the key again', async () => {
    vi.mocked(gitApi.createGitDeployKey).mockRejectedValue({ response: { status: 422, data: { message: 'Bad address.', errors: { repo_url: ['Invalid repository address.'] } } } })
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, regenerateLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(host.props('open')).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'Invalid repository address.' }),
    ])
    expect(gitApi.getGitDeployKey).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('closes the dialog without a request on cancel', async () => {
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, regenerateLabel).trigger('click')
    await flushPromises()
    const host = wrapper.findComponent(ActionModalHost)
    host.vm.$emit('button', 'cancel')
    await flushPromises()

    expect(host.props('open')).toBe(false)
    expect(gitApi.deleteGitDeployKey).not.toHaveBeenCalled()
    expect(gitApi.createGitDeployKey).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('GitView deploy key, disabled state', () => {
  const deleteLabel = 'button.onboarding.gitDeploy.deleteDeployKey'
  const regenerateLabel = 'button.onboarding.gitDeploy.regenerateDeployKey'
  const generateLabel = 'button.onboarding.gitDeploy.generateDeployKey'
  const pullLabel = 'button.git.pull'
  const sshRepo = 'git@example.test:acme.git'
  const key = { public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 acme', fingerprint: 'SHA256:acme' }

  function sshStatus () {
    return {
      connected: true,
      has_synced_once: true,
      repo_url: sshRepo,
      branch: 'main',
      commits_behind: 0,
      commits_ahead: 0,
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
      async_status: { git_auto_deploy: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(sshStatus() as never)
    vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(key)
    vi.mocked(gitApi.pullGit).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('disables the rotate and delete buttons of the key card while the pull request is pending', async () => {
    vi.mocked(gitApi.pullGit).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()

    expect(gitApi.pullGit).toHaveBeenCalledWith(9, undefined)
    expect(findButton(wrapper, regenerateLabel).attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, deleteLabel).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('enables the key card buttons again once the pull request has finished', async () => {
    vi.mocked(gitApi.pullGit).mockResolvedValue(undefined)
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, pullLabel).trigger('click')
    await flushPromises()

    expect(findButton(wrapper, regenerateLabel).attributes('disabled')).toBeUndefined()
    expect(findButton(wrapper, deleteLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps Pull enabled while the key request is pending', async () => {
    vi.mocked(gitApi.getGitDeployKey).mockResolvedValue(null)
    vi.mocked(gitApi.createGitDeployKey).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))

    await findButton(wrapper, generateLabel).trigger('click')
    await flushPromises()

    expect(findButton(wrapper, generateLabel).classes()).toContain('v-btn--loading')
    expect(findButton(wrapper, pullLabel).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})

// Characterization of the DOM: written on the code with raw `v-switch` elements, kept unchanged after they moved to `AppSwitch`.
// The root `.v-input` keeps the view's scope id, so a scoped rule of the view on it still applies (the geometry itself is in `AppSwitch`).
describe('GitView switch DOM', () => {
  const dom = (wrapper: VueWrapper) => {
    const root = wrapper.get('.git-switch')
    return {
      html: normalizeHtml(root.element.outerHTML).replace(/ id="switch-v-\d+"/g, ''),
      scoped: root.element.getAttributeNames().some(name => name.startsWith('data-v-')),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gitApi.getGitLogs).mockResolvedValue({ data: [], meta: { total: 0, last_page: 1 } })
  })

  it('keeps the DOM of the private repository switch', async () => {
    vi.mocked(gitApi.getGitStatus).mockResolvedValue(statusResponse(false, false) as never)
    const { wrapper } = await mountView(makeInstance(false))
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const { html, scoped } = dom(wrapper)
    expect(html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default ma-0 git-switch"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true" checked=""><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
    expect(scoped).toBe(true)
    wrapper.unmount()
  })

  it('keeps the DOM of the auto-deploy switch while the save is in flight (loading)', async () => {
    // The switch now shows the position that was clicked until the answer arrives (and goes back when the save is refused).
    vi.mocked(gitApi.getGitStatus).mockResolvedValue({
      ...statusResponse(true, true),
      repo_url: 'https://example.test/acme.git',
      branch: 'main',
      local_repository_exists: true,
      connection_health: { status: 'ok', reason: null },
      auto_deploy_enabled: false,
    } as never)
    vi.mocked(gitApi.setAutoDeploy).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView(makeInstance(true))
    wrapper.findComponent({ name: 'VSwitch' }).vm.$emit('update:modelValue', true)
    await flushPromises()
    const { html, scoped } = dom(wrapper)
    expect(html).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--inset v-switch--size-default v-switch--loading ma-0 git-switch"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="true" type="checkbox" value="true" checked="" disabled=""><div class="v-switch__thumb v-switch__thumb--filled" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"><div class="v-switch__loader"><div class="v-progress-circular v-progress-circular--indeterminate v-theme--light text-primary" style="width: 16px; height: 16px; --v-progress-reveal-duration: 900ms;" role="progressbar" aria-valuemin="0" aria-valuemax="100" active="true"><svg></svg></div></div></transition-stub></div></div></div></div></div></div>"`)
    expect(scoped).toBe(true)
    wrapper.unmount()
  })
})
