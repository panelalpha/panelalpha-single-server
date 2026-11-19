import { describe, expect, it } from 'vitest'
import { skipPayload, toggleSkipped, visibleDeploySteps } from './deploy-skip'

const STEPS = {
  dependencies: { commands: ['composer install --no-dev'], skippable: true },
  build: { commands: [], skippable: true },
  migrations: { commands: ['php artisan migrate --force'], skippable: false },
}

describe('visibleDeploySteps', () => {
  it('keeps only categories with commands, in the fixed order (legacy DeploySteps.vue:39-78)', () => {
    expect(visibleDeploySteps(STEPS)).toEqual([
      { key: 'dependencies', commands: ['composer install --no-dev'], skippable: true },
      { key: 'migrations', commands: ['php artisan migrate --force'], skippable: false },
    ])
  })

  it('returns nothing for missing or empty steps', () => {
    expect(visibleDeploySteps(null)).toEqual([])
    expect(visibleDeploySteps(undefined)).toEqual([])
    expect(visibleDeploySteps({})).toEqual([])
  })

  it('treats only skippable === true as skippable', () => {
    const steps = { build: { commands: ['npm run build'] } }
    expect(visibleDeploySteps(steps)).toEqual([{ key: 'build', commands: ['npm run build'], skippable: false }])
  })
})

describe('toggleSkipped', () => {
  it('adds the key when unchecked and removes it when checked', () => {
    expect(toggleSkipped([], 'build', false)).toEqual(['build'])
    expect(toggleSkipped(['build'], 'build', true)).toEqual([])
    expect(toggleSkipped(['build'], 'migrations', false)).toEqual(['build', 'migrations'])
  })

  it('does not mutate the input', () => {
    const skipped = ['build'] as const
    toggleSkipped(skipped, 'dependencies', false)
    expect(skipped).toEqual(['build'])
  })
})

describe('skipPayload', () => {
  it('sends only unchecked skippable categories that have commands', () => {
    expect(skipPayload(STEPS, ['dependencies', 'build', 'migrations'])).toEqual({ skip: ['dependencies'] })
  })

  it('returns an empty object (no skip key) when nothing is skipped or nothing is skippable', () => {
    expect(skipPayload(STEPS, [])).toEqual({})
    expect(skipPayload(STEPS, ['migrations'])).toEqual({})
    expect(skipPayload(null, ['dependencies'])).toEqual({})
  })
})
