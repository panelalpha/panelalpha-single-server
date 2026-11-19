import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { runSessionClearedHandlers } from '@/shared/session/session-reset'
import { useWizardStore } from './wizard.store'

describe('useWizardStore', () => {
  it('forgets what the wizard learned on sign-out, so another account starts from the server (impl-review F1)', () => {
    setActivePinia(createPinia())
    const wizard = useWizardStore()
    wizard.reach(2)
    wizard.setHubConnected(true)
    wizard.setAiConnected(true)
    wizard.setHubUrl('https://hub.example.test/account')

    runSessionClearedHandlers()

    expect(wizard.maxStep).toBe(0)
    expect(wizard.hubConnected).toBe(false)
    expect(wizard.aiConnected).toBe(false)
    expect(wizard.hubUrl).toBeNull()
  })
})
