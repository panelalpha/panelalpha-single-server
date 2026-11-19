import type { GitStatus } from './git-status'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { createGitDeployKey, deleteGitDeployKey, getGitDeployKey } from './git.api'
import { useGitDeployKey } from './use-git-deploy-key'

vi.mock('./git.api', () => ({
  getGitDeployKey: vi.fn(),
  createGitDeployKey: vi.fn(),
  deleteGitDeployKey: vi.fn(),
}))

const KEY = { public_key: 'ssh-ed25519 AAAA', fingerprint: 'SHA256:abc' }
const SSH_URL = 'git@github.com:acme/site.git'

function status (overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    connected: true,
    repo_url: SSH_URL,
    branch: 'main',
    pair_branch: null,
    last_deployed_commit_hash: null,
    last_deployed_commit_message: null,
    last_deployed_commit_at: null,
    commits_behind: 0,
    commits_ahead: 0,
    ...overrides,
  }
}

function setup (overrides: { show?: boolean, connected?: boolean, gitStatus?: GitStatus, repoUrl?: string } = {}) {
  const alerts = { addSuccessAlert: vi.fn(), addErrorAlert: vi.fn() }
  const gitStatus = ref<GitStatus>(overrides.gitStatus ?? status({ connected: overrides.connected ?? true }))
  const connected = ref(overrides.connected ?? true)
  const readKey = ref(overrides.show ?? false)
  const repoUrl = ref(overrides.repoUrl ?? '')
  const scope = effectScope()
  const state = scope.run(() => useGitDeployKey({
    instanceId: () => 7,
    gitStatus,
    connected,
    readKey,
    repoUrl,
    alerts,
    t: key => key,
  }))!

  return { state, alerts, scope, gitStatus, connected, readKey, repoUrl }
}

describe('useGitDeployKey', () => {
  let scope: ReturnType<typeof effectScope> | null = null

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    scope?.stop()
    scope = null
  })

  describe('watch of the read (immediate)', () => {
    it('reads the key at once when the page may show it', async () => {
      vi.mocked(getGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ show: true })
      scope = env.scope

      await flushPromises()

      expect(getGitDeployKey).toHaveBeenCalledWith(7)
      expect(env.state.connectedKey.value).toEqual(KEY)
      expect(env.state.connectedKeyLoaded.value).toBe(true)
    })

    it('does not read the key while the page may not show it, and resets the state when it turns off', async () => {
      vi.mocked(getGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ show: false })
      scope = env.scope
      await flushPromises()

      expect(getGitDeployKey).not.toHaveBeenCalled()

      env.readKey.value = true
      await flushPromises()
      expect(env.state.connectedKey.value).toEqual(KEY)

      env.readKey.value = false
      await flushPromises()
      expect(env.state.connectedKey.value).toBeNull()
      expect(env.state.connectedKeyLoaded.value).toBe(false)
    })
  })

  describe('loadConnectedKey', () => {
    it('GET null → loaded without a key', async () => {
      vi.mocked(getGitDeployKey).mockResolvedValue(null)
      const env = setup()
      scope = env.scope

      await env.state.loadConnectedKey()

      expect(env.state.connectedKey.value).toBeNull()
      expect(env.state.connectedKeyLoaded.value).toBe(true)
      expect(env.state.connectedKeyError.value).toBe(false)
      expect(env.state.connectedKeyLoading.value).toBe(false)
    })

    it('GET error → error state, no toast', async () => {
      vi.mocked(getGitDeployKey).mockRejectedValue(new Error('500'))
      const env = setup()
      scope = env.scope

      await env.state.loadConnectedKey()

      expect(env.state.connectedKeyError.value).toBe(true)
      expect(env.state.connectedKey.value).toBeNull()
      expect(env.alerts.addErrorAlert).not.toHaveBeenCalled()
    })

    it('Retry after an error reads the key again and clears the error state', async () => {
      vi.mocked(getGitDeployKey).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(KEY)
      const env = setup()
      scope = env.scope

      await env.state.loadConnectedKey()
      expect(env.state.connectedKeyError.value).toBe(true)
      await env.state.loadConnectedKey()

      expect(env.state.connectedKeyError.value).toBe(false)
      expect(env.state.connectedKey.value).toEqual(KEY)
    })

    it('a late answer after the card was hidden does not bring the key back', async () => {
      let resolveGet: (value: typeof KEY) => void = () => {}
      vi.mocked(getGitDeployKey).mockReturnValue(new Promise(resolve => {
        resolveGet = resolve
      }))
      const env = setup({ show: true })
      scope = env.scope

      env.readKey.value = false
      await flushPromises()
      resolveGet(KEY)
      await flushPromises()

      expect(env.state.connectedKey.value).toBeNull()
      expect(env.state.connectedKeyLoaded.value).toBe(false)
    })
  })

  describe('late answers and parallel requests', () => {
    it('generateSshKey drops the key when the address changed during the request', async () => {
      let resolvePost: (value: typeof KEY) => void = () => {}
      vi.mocked(createGitDeployKey).mockReturnValue(new Promise(resolve => {
        resolvePost = resolve
      }))
      const env = setup({ connected: false, repoUrl: SSH_URL })
      scope = env.scope

      const pending = env.state.generateSshKey(() => true, () => {})
      env.repoUrl.value = 'git@github.com:acme/other.git'
      resolvePost(KEY)
      await pending

      expect(env.state.sshDeployKey.value).toBeNull()
    })

    it('a second rotateKey while the first runs does not send requests', async () => {
      let resolveDelete: () => void = () => {}
      vi.mocked(deleteGitDeployKey).mockReturnValue(new Promise<void>(resolve => {
        resolveDelete = resolve
      }))
      vi.mocked(createGitDeployKey).mockResolvedValue(KEY)
      const env = setup()
      scope = env.scope

      const first = env.state.rotateKey()
      await env.state.rotateKey()
      resolveDelete()
      await first

      expect(deleteGitDeployKey).toHaveBeenCalledTimes(1)
      expect(createGitDeployKey).toHaveBeenCalledTimes(1)
    })
  })

  describe('rotateKey', () => {
    it('connected: DELETE then POST with the stored address, and the new key lands in the card', async () => {
      vi.mocked(deleteGitDeployKey).mockResolvedValue(undefined)
      vi.mocked(createGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ connected: true })
      scope = env.scope

      await env.state.rotateKey()

      expect(deleteGitDeployKey).toHaveBeenCalledWith(7)
      expect(createGitDeployKey).toHaveBeenCalledWith(7, SSH_URL)
      expect(vi.mocked(deleteGitDeployKey).mock.invocationCallOrder[0]!)
        .toBeLessThan(vi.mocked(createGitDeployKey).mock.invocationCallOrder[0]!)
      expect(env.state.connectedKey.value).toEqual(KEY)
      expect(env.state.connectedKeyLoaded.value).toBe(true)
      expect(env.alerts.addErrorAlert).not.toHaveBeenCalled()
    })

    it('connected, POST fails: the card reads the key again', async () => {
      vi.mocked(deleteGitDeployKey).mockResolvedValue(undefined)
      vi.mocked(createGitDeployKey).mockRejectedValue(new Error('down'))
      vi.mocked(getGitDeployKey).mockResolvedValue(null)
      const env = setup({ connected: true })
      scope = env.scope

      await env.state.rotateKey()
      await flushPromises()

      expect(getGitDeployKey).toHaveBeenCalledWith(7)
      expect(env.alerts.addErrorAlert).toHaveBeenCalledTimes(1)
    })

    it('not connected, POST fails: the form drops its key', async () => {
      vi.mocked(deleteGitDeployKey).mockResolvedValue(undefined)
      vi.mocked(createGitDeployKey).mockRejectedValue(new Error('down'))
      const env = setup({ connected: false, repoUrl: SSH_URL, gitStatus: status({ connected: false, repo_url: null }) })
      scope = env.scope
      env.state.sshDeployKey.value = KEY

      await env.state.rotateKey()

      expect(createGitDeployKey).toHaveBeenCalledWith(7, SSH_URL)
      expect(env.state.sshDeployKey.value).toBeNull()
      expect(getGitDeployKey).not.toHaveBeenCalled()
      expect(env.alerts.addErrorAlert).toHaveBeenCalledTimes(1)
    })

    it('not connected, success: the new key goes to the form panel', async () => {
      vi.mocked(deleteGitDeployKey).mockResolvedValue(undefined)
      vi.mocked(createGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ connected: false, repoUrl: SSH_URL, gitStatus: status({ connected: false, repo_url: null }) })
      scope = env.scope
      env.state.sshConnectError.value = 'old'

      await env.state.rotateKey()

      expect(env.state.sshDeployKey.value).toEqual(KEY)
      expect(env.state.sshConnectError.value).toBeNull()
    })
  })

  describe('deleteKey', () => {
    it('success clears the key, shows the success toast and reports the dialog to close', async () => {
      vi.mocked(deleteGitDeployKey).mockResolvedValue(undefined)
      vi.mocked(getGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ show: true })
      scope = env.scope
      await flushPromises()

      const closes = await env.state.deleteKey()

      expect(deleteGitDeployKey).toHaveBeenCalledWith(7)
      expect(closes).toBe(true)
      expect(env.state.connectedKey.value).toBeNull()
      expect(env.state.connectedKeyLoaded.value).toBe(true)
      expect(env.alerts.addSuccessAlert).toHaveBeenCalledWith('heading.onboarding.gitDeploy.auth.deployKey.deleted')
    })

    it('failure is an error toast and the key stays', async () => {
      vi.mocked(deleteGitDeployKey).mockRejectedValue(new Error('locked'))
      vi.mocked(getGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ show: true })
      scope = env.scope
      await flushPromises()

      const closes = await env.state.deleteKey()

      expect(closes).toBe(true)
      expect(env.state.connectedKey.value).toEqual(KEY)
      expect(env.alerts.addSuccessAlert).not.toHaveBeenCalled()
      expect(env.alerts.addErrorAlert).toHaveBeenCalledTimes(1)
    })
  })

  describe('generateSshKey', () => {
    it('stops without a request when the form is invalid', async () => {
      const env = setup({ connected: false, gitStatus: status({ connected: false }) })
      scope = env.scope
      const onFieldError = vi.fn()

      await env.state.generateSshKey(() => false, onFieldError)

      expect(createGitDeployKey).not.toHaveBeenCalled()
      expect(onFieldError).not.toHaveBeenCalled()
    })

    it('generates the key for the form address and clears the field error first', async () => {
      vi.mocked(createGitDeployKey).mockResolvedValue(KEY)
      const env = setup({ connected: false, repoUrl: SSH_URL, gitStatus: status({ connected: false }) })
      scope = env.scope
      const onFieldError = vi.fn()

      await env.state.generateSshKey(() => true, onFieldError)

      expect(createGitDeployKey).toHaveBeenCalledWith(7, SSH_URL)
      expect(onFieldError).toHaveBeenNthCalledWith(1, '')
      expect(env.state.sshDeployKey.value).toEqual(KEY)
      expect(env.state.sshKeyLoading.value).toBe(false)
    })

    it('a failed request reports the repo_url message to the field', async () => {
      vi.mocked(createGitDeployKey).mockRejectedValue(
        Object.assign(new Error('x'), { response: { data: { errors: { repo_url: ['Bad address.'] } } } }),
      )
      const env = setup({ connected: false, repoUrl: SSH_URL, gitStatus: status({ connected: false }) })
      scope = env.scope
      const onFieldError = vi.fn()

      await env.state.generateSshKey(() => true, onFieldError)

      expect(onFieldError).toHaveBeenLastCalledWith('Bad address.')
      expect(env.state.sshDeployKey.value).toBeNull()
    })
  })

  describe('generateConnectedKey', () => {
    it('generates for the stored address; a failure is an error toast', async () => {
      vi.mocked(createGitDeployKey).mockRejectedValueOnce(new Error('down'))
      vi.mocked(createGitDeployKey).mockResolvedValueOnce(KEY)
      const env = setup({ connected: true })
      scope = env.scope

      await env.state.generateConnectedKey()
      expect(env.alerts.addErrorAlert).toHaveBeenCalledTimes(1)

      await env.state.generateConnectedKey()
      expect(createGitDeployKey).toHaveBeenLastCalledWith(7, SSH_URL)
      expect(env.state.connectedKey.value).toEqual(KEY)
    })
  })
})
