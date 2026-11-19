import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGitSsh, createDeployKey, getEnvExampleSsh, getGitBranches, getGitBranchesSsh, previewEnvExample, testGitUrl } from '@/views/onboarding/onboarding.api'
import { getDeployLogsLive } from '@/entities/project/instance-deploy-logs.api'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import OnboardingDeployFromGitModal from './OnboardingDeployFromGitModal.vue'

vi.mock('@/views/onboarding/onboarding.api', () => ({
  testGitUrl: vi.fn(),
  getGitBranches: vi.fn(),
  previewEnvExample: vi.fn(),
  createDeployKey: vi.fn(),
  connectGitSsh: vi.fn(),
  getGitBranchesSsh: vi.fn(),
  getEnvExampleSsh: vi.fn(),
}))

vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  getDeployLogsLive: vi.fn(),
}))

const SSH_URL = 'git@github.com:example/site.git'

let host: HTMLDivElement
let wrapper: Awaited<ReturnType<typeof mountKit>> | null = null
async function mountModal (props: Record<string, unknown> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  wrapper = await mountKit(OnboardingDeployFromGitModal, {
    props: { isOpen: true, ...props },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  return wrapper
}

function field (): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.onboarding-modal input[type="text"], .onboarding-modal input:not([type])')
  if (!input) {
    throw new Error('repo url input not found')
  }
  return input
}

function continueButton (): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('button.continue'))
  if (!button) {
    throw new Error('continue button not found')
  }
  return button
}

async function typeUrl (value: string): Promise<void> {
  const input = field()
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('OnboardingDeployFromGitModal', () => {
  beforeEach(() => {
    vi.mocked(testGitUrl).mockResolvedValue({ success: true })
    vi.mocked(getGitBranches).mockResolvedValue({ success: true, branches: ['main'], default_branch: 'main' })
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: false, variables: [] })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows the protocol note above the repo url field', async () => {
    await mountModal()

    const note = document.querySelector('.onboarding-modal .form-box > p')

    expect(note?.textContent).toContain('heading.onboarding.gitDeploy.repoUrl.protocolInfo')
    expect(note?.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps continue disabled until a repo url is typed', async () => {
    await mountModal()

    expect(continueButton().disabled).toBe(true)

    await typeUrl('https://example.com/repo.git')

    expect(continueButton().disabled).toBe(false)
  })

  it('emits next with the connected repo after the three requests', async () => {
    const m = await mountModal()
    await typeUrl('https://example.com/repo.git')

    continueButton().click()
    await flushPromises()

    expect(testGitUrl).toHaveBeenCalledWith({ repo_url: 'https://example.com/repo.git', token: null })
    expect(m.emitted('next')?.[0]?.[0]).toEqual({
      repo_url: 'https://example.com/repo.git',
      token: null,
      branches: ['main'],
      default_branch: 'main',
      preview: { has_example: false, variables: [] },
    })
  })

  it('shows the failed url test message and emits nothing', async () => {
    vi.mocked(testGitUrl).mockResolvedValue({ success: false, error_message: 'Repository not found' })
    const m = await mountModal()
    await typeUrl('https://example.com/missing.git')

    continueButton().click()
    await flushPromises()

    // The i18next component fills `{message}` with the slot only when the copy has it; the test env has no copy, so the box is checked.
    expect(document.querySelector('.app-message--error')).not.toBeNull()
    expect(m.emitted('next')).toBeUndefined()
  })

  it('does not emit next for a connect started before the modal was closed and reopened', async () => {
    let resolveFirst: (value: { success: boolean }) => void = () => {}
    vi.mocked(testGitUrl).mockImplementationOnce(() => new Promise(resolve => {
      resolveFirst = resolve
    }))
    const m = await mountModal()
    await typeUrl('https://example.com/a.git')

    continueButton().click()
    await flushPromises()

    await m.setProps({ isOpen: false })
    await m.setProps({ isOpen: true })
    await typeUrl('https://example.com/b.git')

    resolveFirst({ success: true })
    await flushPromises()

    expect(m.emitted('next')).toBeUndefined()
  })

  describe('SSH address (deploy key)', () => {
    function buttonByText (text: string): HTMLButtonElement {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))
      if (!button) {
        throw new Error(`button "${text}" not found`)
      }
      return button
    }

    it('hides the private switch and shows the branch field with main', async () => {
      await mountModal()
      await typeUrl(SSH_URL)

      expect(document.querySelector('.onboarding-modal input[type="checkbox"]')).toBeNull()
      const branch = document.querySelector<HTMLInputElement>('.onboarding-modal input[placeholder="main"]')
      expect(branch?.value).toBe('main')
      expect(testGitUrl).not.toHaveBeenCalled()
    })

    it('labels the button generate deploy key and disables it with an empty branch', async () => {
      await mountModal()
      await typeUrl(SSH_URL)

      expect(buttonByText('button.onboarding.gitDeploy.generateDeployKey').disabled).toBe(false)

      const branch = document.querySelector<HTMLInputElement>('.onboarding-modal input[placeholder="main"]')!
      branch.value = '  '
      branch.dispatchEvent(new Event('input'))
      await flushPromises()

      expect(buttonByText('button.onboarding.gitDeploy.generateDeployKey').disabled).toBe(true)
    })

    it('creates the deploy key project with the service, domain and shared users, then locks the url', async () => {
      vi.mocked(createDeployKey).mockResolvedValue({
        project: { id: 502, name: 'site' },
        deploy_key: { public_key: 'ssh-ed25519 AAAA' },
      })
      const m = await mountModal({ serviceId: 10, domainId: 501, sharedAccess: ['ann@example.com'] })
      await typeUrl(SSH_URL)

      buttonByText('button.onboarding.gitDeploy.generateDeployKey').click()
      await flushPromises()

      expect(createDeployKey).toHaveBeenCalledWith({
        service_id: 10,
        domain_id: 501,
        shared_access: ['ann@example.com'],
        repo_url: SSH_URL,
      })
      expect(m.emitted('deploy-key-created')?.[0]?.[0]).toEqual({ project: { id: 502, name: 'site' } })
      expect(m.emitted('next')).toBeUndefined()
      expect(field().disabled).toBe(true)
    })

    it('shows the repo_url message of a 422 in the error box and creates no project', async () => {
      vi.mocked(createDeployKey).mockRejectedValue({
        response: { status: 422, data: { errors: { repo_url: ['The repository address is invalid.'] } } },
      })
      const m = await mountModal({ serviceId: 10, domainId: null, sharedAccess: [] })
      await typeUrl(SSH_URL)

      buttonByText('button.onboarding.gitDeploy.generateDeployKey').click()
      await flushPromises()

      expect(document.querySelector('.app-message--error')).not.toBeNull()
      expect(m.emitted('deploy-key-created')).toBeUndefined()
      expect(field().disabled).toBe(false)
    })

    describe('deploy key confirmation and the continue button', () => {
      const KEY = 'ssh-ed25519 AAAA'

      function checkbox (): HTMLInputElement {
        const input = document.querySelector<HTMLInputElement>('.onboarding-modal input[type="checkbox"]')
        if (!input) {
          throw new Error('key checkbox not found')
        }
        return input
      }

      async function generate () {
        vi.mocked(createDeployKey).mockResolvedValue({
          project: { id: 502, name: 'site' },
          deploy_key: { public_key: KEY },
        })
        const m = await mountModal({ serviceId: 10, domainId: 501, sharedAccess: [] })
        await typeUrl(SSH_URL)
        buttonByText('button.onboarding.gitDeploy.generateDeployKey').click()
        await flushPromises()
        return m
      }

      it('shows the key panel and an unconfirmed checkbox, with continue offered and disabled', async () => {
        await generate()

        expect(document.querySelector('.deploy-key-panel')).not.toBeNull()
        expect(document.body.textContent).toContain('heading.onboarding.gitDeploy.auth.deployKey.continueMessage')
        expect(checkbox().checked).toBe(false)
        expect(buttonByText('button.continue').disabled).toBe(true)
      })

      it('offers continue without waiting for the create deploy, which waits for the repository files', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        await generate()

        // The key step does not read the deploy log: an SSH create's deploy stays `running` until the connect brings files.
        await vi.advanceTimersByTimeAsync(30_000)
        await flushPromises()
        expect(getDeployLogsLive).not.toHaveBeenCalled()
        expect(buttonByText('button.continue').disabled).toBe(true)

        checkbox().click()
        await flushPromises()

        expect(buttonByText('button.continue').disabled).toBe(false)
      })

      it('cancelling the step with the created project asks the flow to remove it', async () => {
        const m = await generate()

        buttonByText('button.cancel').click()
        await flushPromises()

        expect(m.emitted('cancel-created-project')).toHaveLength(1)
        expect(m.emitted('remove-modal')).toBeUndefined()
      })

      it('closing the form with the created project asks the flow to remove it too', async () => {
        const m = await generate()

        const close = [...document.querySelectorAll<HTMLButtonElement>('.onboarding-modal button')]
          .find(b => b.getAttribute('aria-label') === 'button.close')
        close?.click()
        await flushPromises()

        expect(m.emitted('cancel-created-project')).toHaveLength(1)
        expect(m.emitted('remove-modal')).toBeUndefined()
      })

      it('cancelling before the key exists only closes the step', async () => {
        const m = await mountModal({ serviceId: 10, domainId: 501, sharedAccess: [] })
        await typeUrl(SSH_URL)

        buttonByText('button.cancel').click()
        await flushPromises()

        expect(m.emitted('remove-modal')).toHaveLength(1)
        expect(m.emitted('cancel-created-project')).toBeUndefined()
      })
    })

    describe('connect of the created project', () => {
      const KEY = 'ssh-ed25519 AAAA'

      function continueButton (): HTMLButtonElement {
        return buttonByText('button.continue')
      }

      /** Creates the key project and confirms the key, so Continue connects. */
      async function readyToConnect () {
        vi.mocked(createDeployKey).mockResolvedValue({
          project: { id: 502, name: 'site' },
          deploy_key: { public_key: KEY },
        })
        const m = await mountModal({ serviceId: 10, domainId: 501, sharedAccess: [] })
        await typeUrl(SSH_URL)
        buttonByText('button.onboarding.gitDeploy.generateDeployKey').click()
        await flushPromises()
        document.querySelector<HTMLInputElement>('.onboarding-modal input[type="checkbox"]')!.click()
        await flushPromises()
        return m
      }

      it('connects the project, reads its branches and env example, then emits next in ssh mode', async () => {
        vi.mocked(connectGitSsh).mockResolvedValue({ branch_missing: false })
        vi.mocked(getGitBranchesSsh).mockResolvedValue(['main', 'dev'])
        vi.mocked(getEnvExampleSsh).mockResolvedValue({ has_example: false, variables: [] })
        const m = await readyToConnect()

        continueButton().click()
        await flushPromises()

        expect(connectGitSsh).toHaveBeenCalledWith(502, { repo_url: SSH_URL, branch: 'main' })
        expect(getGitBranchesSsh).toHaveBeenCalledWith(502)
        expect(getEnvExampleSsh).toHaveBeenCalledWith(502)
        expect(m.emitted('next')?.[0]?.[0]).toEqual({
          mode: 'ssh',
          repo_url: SSH_URL,
          token: null,
          branch: 'main',
          branch_missing: false,
          branches: ['main', 'dev'],
          default_branch: 'main',
          preview: { has_example: false, variables: [] },
        })
      })

      it('keeps an empty branch list and no example when those reads fail', async () => {
        vi.mocked(connectGitSsh).mockResolvedValue({ branch_missing: true })
        vi.mocked(getGitBranchesSsh).mockRejectedValue(new Error('offline'))
        vi.mocked(getEnvExampleSsh).mockRejectedValue(new Error('offline'))
        const m = await readyToConnect()

        continueButton().click()
        await flushPromises()

        expect(m.emitted('next')?.[0]?.[0]).toMatchObject({ mode: 'ssh', branch_missing: true, branches: [], preview: { has_example: false, variables: [] } })
      })

      it('shows a failed connect under the key panel and emits nothing', async () => {
        vi.mocked(connectGitSsh).mockRejectedValue({
          response: { status: 422, data: { errors: { repo_url: ['The repository could not be connected.'] } } },
        })
        const m = await readyToConnect()

        continueButton().click()
        await flushPromises()

        expect(document.querySelector('.deploy-key-panel')?.textContent).toContain('The repository could not be connected.')
        expect(document.querySelector('.app-message--error')).toBeNull()
        expect(m.emitted('next')).toBeUndefined()
        expect(continueButton().disabled).toBe(false)
      })
    })
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch`, kept unchanged after it moved to `AppSwitch`.
describe('OnboardingDeployFromGitModal switch DOM', () => {
  const dom = () => normalizeHtml(document.querySelector('.onboarding-modal .v-switch')!.outerHTML).replace(/ id="switch-v-\d+"/g, '')

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    vi.clearAllMocks()
  })

  it('keeps the DOM of the private switch when it is on', async () => {
    await mountModal()
    const input = document.querySelector<HTMLInputElement>('.onboarding-modal .v-switch input')!
    input.click()
    await flushPromises()
    expect(dom()).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--inset v-switch--size-default ma-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true" checked=""><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
  })

  it('keeps the DOM of the private switch while connecting (disabled)', async () => {
    vi.mocked(testGitUrl).mockReturnValue(new Promise(() => {}))
    await mountModal()
    await typeUrl('https://example.com/repo.git')
    continueButton().click()
    await flushPromises()
    expect(dom()).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--inset v-switch--size-default ma-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="true" type="checkbox" value="true" disabled=""><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div>"`)
  })
})
