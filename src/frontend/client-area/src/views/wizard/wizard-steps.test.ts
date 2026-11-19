import { describe, expect, it } from 'vitest'
import { canOpenStep, isSetupDone, isStepClosedBySetup, nextMaxStep, nextPath, pathOfSlug, pathOfStep, previousPath, stepFromPath, stepIndex, stepNumber, stepState, WIZARD_STEPS } from './wizard-steps'

describe('wizard steps', () => {
  it('lists the four steps in order', () => {
    expect(WIZARD_STEPS.map(step => step.slug)).toEqual(['panelalpha-connect', 'general-config', 'connect-ai', 'summary'])
    expect(stepIndex('summary')).toBe(3)
    expect(stepNumber('connect-ai')).toBe(3)
    expect(stepNumber('summary')).toBe(4)
  })

  it('maps a path to the step index and back', () => {
    expect(stepFromPath('/wizard/panelalpha-connect')).toBe(0)
    expect(stepFromPath('/wizard/general-config')).toBe(1)
    expect(stepFromPath('/wizard/connect-ai')).toBe(2)
    expect(stepFromPath('/wizard/summary')).toBe(3)
    expect(stepFromPath('/wizard/summary/')).toBe(3)
    expect(pathOfStep(0)).toBe('/wizard/panelalpha-connect')
    expect(pathOfStep(1)).toBe('/wizard/general-config')
    expect(pathOfStep(2)).toBe('/wizard/connect-ai')
    expect(pathOfStep(3)).toBe('/wizard/summary')
  })

  it('treats the start page and foreign paths as no step', () => {
    expect(stepFromPath('/wizard')).toBe(-1)
    expect(stepFromPath('/wizard/unknown')).toBe(-1)
    expect(stepFromPath('/setup')).toBe(-1)
    expect(pathOfStep(-1)).toBe('/wizard')
    expect(pathOfStep(4)).toBe('/wizard')
  })

  it('moves between steps by slug, not by index', () => {
    expect(pathOfSlug('summary')).toBe('/wizard/summary')
    expect(nextPath('panelalpha-connect')).toBe('/wizard/general-config')
    expect(nextPath('general-config')).toBe('/wizard/connect-ai')
    expect(nextPath('connect-ai')).toBe('/wizard/summary')
    expect(nextPath('summary')).toBe('/wizard')
    expect(previousPath('summary')).toBe('/wizard/connect-ai')
    expect(previousPath('connect-ai')).toBe('/wizard/general-config')
    expect(previousPath('general-config')).toBe('/wizard/panelalpha-connect')
    expect(previousPath('panelalpha-connect')).toBe('/wizard')
  })

  it('opens only the steps up to the furthest one reached', () => {
    expect(canOpenStep(0, 0)).toBe(true)
    expect(canOpenStep(1, 0)).toBe(false)
    expect(canOpenStep(1, 2)).toBe(true)
    expect(canOpenStep(2, 2)).toBe(true)
    expect(canOpenStep(3, 5)).toBe(true)
    expect(canOpenStep(4, 5)).toBe(false)
    expect(canOpenStep(-1, 2)).toBe(false)
  })

  it('closes step 1 once the setup is done and leaves the other steps as they were', () => {
    expect(canOpenStep(0, 2, { setupDone: true })).toBe(false)
    expect(canOpenStep(0, 2, { setupDone: false })).toBe(true)
    expect(canOpenStep(0, 2, {})).toBe(true)
    expect(canOpenStep(1, 2, { setupDone: true })).toBe(true)
    expect(canOpenStep(2, 2, { setupDone: true })).toBe(true)
    expect(canOpenStep(2, 1, { setupDone: true })).toBe(false)
    expect(canOpenStep(3, 3, { setupDone: true })).toBe(true)
    expect(isStepClosedBySetup(0, { setupDone: true })).toBe(true)
    expect(isStepClosedBySetup(1, { setupDone: true })).toBe(false)
    expect(isStepClosedBySetup(0)).toBe(false)
  })

  it('only grows the furthest step', () => {
    expect(nextMaxStep(0, 1)).toBe(1)
    expect(nextMaxStep(2, 0)).toBe(2)
    expect(nextMaxStep(1, 1)).toBe(1)
  })

  it('marks the steps completed, current and future', () => {
    expect([0, 1, 2, 3].map(index => stepState(index, 1))).toEqual(['completed', 'current', 'future', 'future'])
    expect([0, 1, 2, 3].map(index => stepState(index, 0))).toEqual(['current', 'future', 'future', 'future'])
    expect([0, 1, 2, 3].map(index => stepState(index, 2))).toEqual(['completed', 'completed', 'current', 'future'])
  })
})

describe('isSetupDone', () => {
  it('is done for a signed-in user, or when the panel no longer asks for the setup', () => {
    expect(isSetupDone(true, true)).toBe(true)
    expect(isSetupDone(false, false)).toBe(true)
    expect(isSetupDone(true, undefined)).toBe(true)
  })

  it('is not done for a guest on a panel that needs its setup, or while /home is unknown', () => {
    expect(isSetupDone(false, true)).toBe(false)
    expect(isSetupDone(false, undefined)).toBe(false)
  })
})
