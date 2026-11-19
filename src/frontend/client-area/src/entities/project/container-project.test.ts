import { describe, expect, it } from 'vitest'
import { isContainerProject } from '@/entities/project/container-project'

describe('isContainerProject', () => {
  it('is true only for a custom project with a container', () => {
    expect(isContainerProject({ type: 'custom', isContainer: true })).toBe(true)
    expect(isContainerProject({ type: 'custom', isContainer: false })).toBe(false)
    expect(isContainerProject({ type: 'wordpress', isContainer: true })).toBe(false)
    expect(isContainerProject({ type: undefined, isContainer: false })).toBe(false)
  })
})
