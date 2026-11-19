import { describe, expect, it } from 'vitest'
import { deployStepLabelKey, STAGE_ORDER, visibleSteps } from './deploy-steps'

const states = (steps: ReturnType<typeof visibleSteps>) => steps.map(s => s.state)

describe('visibleSteps', () => {
  it('always lists the fixed 3-step pipeline', () => {
    expect(STAGE_ORDER).toEqual(['preparing', 'cloning', 'running'])
    expect(visibleSteps([], null, 'running').map(s => s.name)).toEqual(STAGE_ORDER)
    expect(visibleSteps(null, null, 'running')).toHaveLength(3)
  })

  it('renders missing stages as pending', () => {
    expect(states(visibleSteps([], null, 'running'))).toEqual(['pending', 'pending', 'pending'])
  })

  it('marks the current stage without an entry as progress', () => {
    expect(states(visibleSteps([], 'preparing', 'running'))).toEqual(['progress', 'pending', 'pending'])
  })

  it('finished stage is done with a duration of at least 1s', () => {
    const steps = visibleSteps(
      [
        { name: 'preparing', started_at: 100, finished_at: 112 },
        { name: 'cloning', started_at: 112, finished_at: 112 },
        { name: 'running', started_at: 112 },
      ],
      'running',
      'running',
    )
    expect(states(steps)).toEqual(['done', 'done', 'progress'])
    expect(steps.map(s => s.duration)).toEqual([12, 1, null])
  })

  it('terminal success closes an open stage as done', () => {
    const steps = visibleSteps([{ name: 'preparing', started_at: 1 }], 'preparing', 'success')
    expect(states(steps)).toEqual(['done', 'skipped', 'skipped'])
  })

  it('a finished deploy marks a stage it never started as skipped, not waiting', () => {
    // A redeploy (or a pull) runs only the engine's `running` stage.
    const steps = visibleSteps([{ name: 'running', started_at: 1_781_000_000, finished_at: 1_781_000_047 }], 'running', 'finished')
    expect(states(steps)).toEqual(['skipped', 'skipped', 'done'])
    expect(steps.map(s => s.duration)).toEqual([null, null, 47])
  })

  it('a running deploy marks the stages it went past as skipped, not waiting', () => {
    // A redeploy starts at `running`: preparing and cloning were never run.
    expect(states(visibleSteps([{ name: 'running', started_at: 1_781_000_000 }], 'running', 'running')))
      .toEqual(['skipped', 'skipped', 'progress'])
  })

  it('a running files deploy that starts at cloning marks preparing as skipped', () => {
    expect(states(visibleSteps([{ name: 'cloning', started_at: 1 }], 'cloning', 'running')))
      .toEqual(['skipped', 'progress', 'pending'])
  })

  it('a running redeploy with preparing done marks the cloning stage it skipped as skipped', () => {
    const stages = [
      { name: 'preparing', started_at: 1, finished_at: 3 },
      { name: 'running', started_at: 3 },
    ]
    expect(states(visibleSteps(stages, 'running', 'running'))).toEqual(['done', 'skipped', 'progress'])
  })

  it('a running deploy with no stage yet keeps the stages after the current one as pending', () => {
    expect(states(visibleSteps([], 'running', 'running'))).toEqual(['skipped', 'skipped', 'progress'])
    expect(states(visibleSteps([], 'cloning', 'running'))).toEqual(['skipped', 'progress', 'pending'])
  })

  it('a running deploy with an unknown current stage keeps every step pending', () => {
    expect(states(visibleSteps([], 'unknown', 'running'))).toEqual(['pending', 'pending', 'pending'])
  })

  it('a create deploy walks the stages one by one, none is skipped while the engine moves on', () => {
    // The engine writes each stage entry before it starts the next one (DeployLogger::stage), so a create never has a gap.
    const preparing = { name: 'preparing', started_at: 100, finished_at: null }
    expect(states(visibleSteps([preparing], 'preparing', 'running'))).toEqual(['progress', 'pending', 'pending'])

    const cloning = [{ ...preparing, finished_at: 103 }, { name: 'cloning', started_at: 103, finished_at: null }]
    expect(states(visibleSteps(cloning, 'cloning', 'running'))).toEqual(['done', 'progress', 'pending'])

    const running = [cloning[0]!, { ...cloning[1]!, finished_at: 110 }, { name: 'running', started_at: 110, finished_at: null }]
    expect(states(visibleSteps(running, 'running', 'running'))).toEqual(['done', 'done', 'progress'])
  })

  it('failed and cancelled turn an open stage into error, a finished one stays done', () => {
    const stages = [
      { name: 'preparing', started_at: 1, finished_at: 3 },
      { name: 'cloning', started_at: 3 },
    ]
    expect(states(visibleSteps(stages, 'cloning', 'failed'))).toEqual(['done', 'error', 'skipped'])
    expect(states(visibleSteps(stages, 'cloning', 'cancelled'))).toEqual(['done', 'error', 'skipped'])
  })

  it('marks the stage the deploy died in as error, though the engine closed it with the deploy', () => {
    const stages = [
      { name: 'preparing', started_at: 100, finished_at: 112 },
      { name: 'cloning', started_at: 112, finished_at: 160 },
      { name: 'running', started_at: 160, finished_at: 172 },
    ]
    expect(states(visibleSteps(stages, 'running', 'failed'))).toEqual(['done', 'done', 'error'])
    expect(states(visibleSteps(stages, 'running', 'cancelled'))).toEqual(['done', 'done', 'error'])
    expect(states(visibleSteps(stages, 'running', 'finished'))).toEqual(['done', 'done', 'done'])
  })

  it('terminal status marks the current stage without an entry as done or error', () => {
    expect(states(visibleSteps([], 'preparing', 'finished'))).toEqual(['done', 'skipped', 'skipped'])
    expect(states(visibleSteps([], 'preparing', 'failed'))).toEqual(['error', 'skipped', 'skipped'])
  })
})

describe('deployStepLabelKey', () => {
  it('names the git pipeline stage after the repository for a git deploy', () => {
    expect(deployStepLabelKey('cloning', 'git')).toBe('deployLogs.step.cloning')
    expect(deployStepLabelKey('preparing', 'git')).toBe('deployLogs.step.preparing')
    expect(deployStepLabelKey('running', 'git')).toBe('deployLogs.step.running')
  })

  it('names the cloning stage after the uploaded files for a files deploy', () => {
    expect(deployStepLabelKey('cloning', 'files')).toBe('deployLogs.step.files')
    // The other stages are the same work for both sources.
    expect(deployStepLabelKey('preparing', 'files')).toBe('deployLogs.step.preparing')
    expect(deployStepLabelKey('running', 'files')).toBe('deployLogs.step.running')
  })

  it('keeps the git copy when the screen does not know the source', () => {
    expect(deployStepLabelKey('cloning', null)).toBe('deployLogs.step.cloning')
    expect(deployStepLabelKey('cloning', undefined)).toBe('deployLogs.step.cloning')
  })
})
