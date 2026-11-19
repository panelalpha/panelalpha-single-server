import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWizardFlow, isWizardFlowInProgress, markWizardFlowInProgress, WIZARD_FLOW_KEY } from './wizard-path'

describe('wizard flow mark', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('is set by a visit of the wizard and read back from the same tab', () => {
    expect(isWizardFlowInProgress()).toBe(false)
    markWizardFlowInProgress()
    expect(window.sessionStorage.getItem(WIZARD_FLOW_KEY)).toBe('1')
    expect(isWizardFlowInProgress()).toBe(true)
  })

  it('is forgotten by the finish', () => {
    markWizardFlowInProgress()
    clearWizardFlow()
    expect(isWizardFlowInProgress()).toBe(false)
    // Clearing twice is not an error (a finish after a conflict, a second click).
    expect(() => clearWizardFlow()).not.toThrow()
  })

  it('reads a storage of its own, so a test or a caller can pass one', () => {
    const storage = { getItem: vi.fn(() => '1'), setItem: vi.fn(), removeItem: vi.fn() }
    expect(isWizardFlowInProgress(storage)).toBe(true)
    expect(storage.getItem).toHaveBeenCalledWith(WIZARD_FLOW_KEY)
    markWizardFlowInProgress(storage)
    expect(storage.setItem).toHaveBeenCalledWith(WIZARD_FLOW_KEY, '1')
    clearWizardFlow(storage)
    expect(storage.removeItem).toHaveBeenCalledWith(WIZARD_FLOW_KEY)
  })

  it('survives a browser that refuses storage', () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      removeItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
    }
    expect(isWizardFlowInProgress(broken)).toBe(false)
    expect(() => markWizardFlowInProgress(broken)).not.toThrow()
    expect(() => clearWizardFlow(broken)).not.toThrow()
    expect(isWizardFlowInProgress(null)).toBe(false)
  })
})
