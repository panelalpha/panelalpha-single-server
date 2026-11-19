import type { EnvVarsContext } from '@/views/onboarding/onboarding.store'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VSelect } from 'vuetify/components'
import { previewEnvExample } from '@/views/onboarding/onboarding.api'
import { mountKit } from '@/test/mount-kit'
import OnboardingEnvVarsModal from './OnboardingEnvVarsModal.vue'

vi.mock('@/views/onboarding/onboarding.api', () => ({
  previewEnvExample: vi.fn(),
}))

let host: HTMLDivElement

const EXAMPLE_VARIABLES = [{ key: 'DB_HOST', value: 'localhost' }, { key: 'DB_PORT', value: '3306' }]

function context (patch: Partial<EnvVarsContext> = {}): EnvVarsContext {
  return {
    source: 'git',
    variables: EXAMPLE_VARIABLES,
    hasExample: true,
    branches: ['main'],
    branch: 'main',
    repoUrl: 'https://x.test/r.git',
    token: null,
    previewReady: true,
    ...patch,
  }
}

async function mountModal (props: Record<string, unknown> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  return mountKit(OnboardingEnvVarsModal, {
    props: { isOpen: true, context: context(), ...props },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
}

function valueInputs (): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.env-row input:not([readonly])')]
}

function buttonByText (text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))
  if (!button) {
    throw new Error(`button "${text}" not found`)
  }
  return button
}

async function editValue (index: number, value: string): Promise<void> {
  const input = valueInputs()[index]
  if (!input) {
    throw new Error(`value input ${index} not found`)
  }
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('OnboardingEnvVarsModal', () => {
  beforeEach(() => {
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: EXAMPLE_VARIABLES })
  })

  afterEach(() => {
    host?.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('renders each variable: the key read-only, the value editable', async () => {
    await mountModal()

    const keys = [...document.querySelectorAll<HTMLInputElement>('.env-row input[readonly]')].map(input => input.value)
    expect(keys).toEqual(['DB_HOST', 'DB_PORT'])
    expect(valueInputs().map(input => input.value)).toEqual(['localhost', '3306'])
  })

  it('continue emits only the changed keys and the selected branch', async () => {
    const m = await mountModal()

    await editValue(0, 'db.internal')
    buttonByText('button.continue').click()
    await flushPromises()

    expect(m.emitted('next')?.[0]?.[0]).toEqual({ env_vars: { DB_HOST: 'db.internal' }, skipped: false, branch: 'main' })
  })

  it('skip emits no variables, marked skipped, with the selected branch', async () => {
    const m = await mountModal()

    buttonByText('heading.onboarding.envVars.skip').click()
    await flushPromises()

    expect(m.emitted('next')?.[0]?.[0]).toEqual({ env_vars: {}, skipped: true, branch: 'main' })
  })

  it('renders no rows and continues as a skip when the repo has no example', async () => {
    const m = await mountModal({ context: context({ variables: [], hasExample: false }) })

    expect(document.querySelector('.env-rows')).toBeNull()
    buttonByText('button.continue').click()
    await flushPromises()

    expect(m.emitted('next')?.[0]?.[0]).toEqual({ env_vars: {}, skipped: true, branch: 'main' })
  })

  it('titles the step for the branch when the repo has no example', async () => {
    await mountModal({ context: context({ variables: [], hasExample: false, branches: ['main', 'dev'] }) })

    expect(document.body.textContent).toContain('heading.onboarding.envVars.noExample.title')
    expect(document.body.textContent).toContain('heading.onboarding.envVars.noExample.subtitle')
    expect(document.body.textContent).not.toContain('heading.onboarding.envVars.subtitle')
  })

  it('keeps the environment variables copy when the repo has an example', async () => {
    await mountModal()

    expect(document.body.textContent).toContain('heading.onboarding.envVars.title')
    expect(document.body.textContent).toContain('heading.onboarding.envVars.subtitle')
    expect(document.body.textContent).not.toContain('heading.onboarding.envVars.noExample.subtitle')
  })

  it('shows the branch select only for a git source with more than one branch', async () => {
    const many = await mountModal({ context: context({ branches: ['main', 'dev'] }) })
    expect(many.findComponent(VSelect).exists()).toBe(true)

    const one = await mountModal({ context: context({ branches: ['main'] }) })
    expect(one.findComponent(VSelect).exists()).toBe(false)
  })

  it('a branch change with edited values asks first, and a cancel keeps the branch (D2)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const m = await mountModal({ context: context({ branches: ['main', 'dev'] }) })
    await editValue(0, 'edited')

    m.findComponent(VSelect).vm.$emit('update:modelValue', 'dev')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('heading.onboarding.envVars.branch.resetConfirm')
    expect(previewEnvExample).not.toHaveBeenCalled()
    expect(m.findComponent(VSelect).props('modelValue')).toBe('main')
  })

  it('a branch change that is confirmed previews the new branch and drops the edited values', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: [{ key: 'DB_HOST', value: 'dev-host' }] })
    const m = await mountModal({ context: context({ branches: ['main', 'dev'] }) })
    await editValue(0, 'edited')

    m.findComponent(VSelect).vm.$emit('update:modelValue', 'dev')
    await flushPromises()

    expect(previewEnvExample).toHaveBeenCalledWith({ repo_url: 'https://x.test/r.git', token: null, branch: 'dev' })
    expect(m.findComponent(VSelect).props('modelValue')).toBe('dev')
    expect(valueInputs().map(input => input.value)).toEqual(['dev-host'])
  })

  it('a late branch preview after the modal closed changes nothing and emits nothing', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.mocked(previewEnvExample).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }) as never)
    const m = await mountModal({ context: context({ branches: ['main', 'dev'] }) })

    m.findComponent(VSelect).vm.$emit('update:modelValue', 'dev')
    await m.setProps({ isOpen: false })
    finish({ has_example: true, variables: [{ key: 'LATE', value: '1' }] })
    await flushPromises()

    expect(m.emitted('next')).toBeUndefined()
    expect(document.querySelector('.env-rows')).toBeNull()
  })

  describe('SSH deploy (legacy sshMode)', () => {
    const MISSING = { sshMode: true, branchMissing: true, missingBranch: 'feature', branches: ['main', 'develop'], branch: null }

    it('shows the missing branch copy above the select, with no branch picked and Skip and Continue off', async () => {
      const m = await mountModal({ context: context(MISSING) })

      expect(document.querySelector('.text-error')?.textContent).toContain('heading.onboarding.gitDeploy.branchMissing')
      expect(m.findComponent(VSelect).props('modelValue')).toBeNull()
      expect(buttonByText('button.continue').disabled).toBe(true)
      expect(buttonByText('heading.onboarding.envVars.skip').disabled).toBe(true)
    })

    it('hides the copy when the SSH branch is present', async () => {
      await mountModal({ context: context({ ...MISSING, branchMissing: false, branch: 'main' }) })

      expect(document.querySelector('.text-error')).toBeNull()
    })

    it('picking another branch enables Continue, does not preview, and continues on that branch', async () => {
      const m = await mountModal({ context: context(MISSING) })

      m.findComponent(VSelect).vm.$emit('update:modelValue', 'develop')
      await flushPromises()

      expect(previewEnvExample).not.toHaveBeenCalled()
      expect(buttonByText('button.continue').disabled).toBe(false)
      buttonByText('button.continue').click()
      await flushPromises()
      expect(m.emitted('next')?.[0]?.[0]).toEqual({ env_vars: {}, skipped: false, branch: 'develop' })
    })

    it('hides the info hint in SSH mode', async () => {
      await mountModal({ context: context({ sshMode: true, branchMissing: false, branch: 'main' }) })

      expect(document.body.textContent).not.toContain('heading.onboarding.envVars.hint')
    })

    it('shows the info hint for a git source, so the SSH check above is not vacuous', async () => {
      await mountModal({ context: context() })

      expect(document.body.textContent).toContain('heading.onboarding.envVars.hint')
    })
  })
})
