import { describe, expect, it } from 'vitest'
import { deployKeySettingsUrl, repoProvider, resolveSshDefaultBranch, resolveSshNextStep } from './git-ssh-launch'

describe('repoProvider and deployKeySettingsUrl', () => {
  it('detects GitHub', () => {
    expect(repoProvider('git@github.com:o/r.git')).toBe('github')
    expect(deployKeySettingsUrl('git@github.com:o/r.git')).toBe('https://github.com/o/r/settings/keys')
  })

  it('detects GitLab with nested groups', () => {
    expect(repoProvider('ssh://git@gitlab.com/g/sub/r.git')).toBe('gitlab')
    expect(deployKeySettingsUrl('ssh://git@gitlab.com/g/sub/r.git')).toBe('https://gitlab.com/g/sub/r/-/settings/repository')
  })

  it('detects Bitbucket', () => {
    expect(repoProvider('git@bitbucket.org:ws/r.git')).toBe('bitbucket')
    expect(deployKeySettingsUrl('git@bitbucket.org:ws/r.git')).toBe('https://bitbucket.org/ws/r/admin/access-keys/')
  })

  it('returns null for other forges and non-SSH urls', () => {
    expect(repoProvider('git@git.example.com:o/r.git')).toBe('other')
    expect(deployKeySettingsUrl('git@git.example.com:o/r.git')).toBeNull()
    expect(repoProvider('https://github.com/o/r')).toBe('other')
    expect(deployKeySettingsUrl('https://github.com/o/r')).toBeNull()
  })
})

describe('resolveSshNextStep', () => {
  const example = { has_example: true, variables: [{ key: 'A', value: '1' }] }
  const none = { has_example: false, variables: [] }

  it('asks for a branch when it is missing, whatever the list holds', () => {
    expect(resolveSshNextStep({ branchMissing: true, branches: [], preview: none })).toBe('env-vars')
    expect(resolveSshNextStep({ branchMissing: true, branches: ['x'], preview: none })).toBe('env-vars')
    expect(resolveSshNextStep({ branchMissing: true, branches: ['x', 'y'], preview: none })).toBe('env-vars')
  })

  it('shows the env step when an example exists', () => {
    expect(resolveSshNextStep({ branchMissing: false, branches: ['main'], preview: example })).toBe('env-vars')
  })

  it('shows the env step when there are several branches', () => {
    expect(resolveSshNextStep({ branchMissing: false, branches: ['main', 'dev'], preview: none })).toBe('env-vars')
  })

  it('deploys straight away with one or no branch and no example', () => {
    expect(resolveSshNextStep({ branchMissing: false, branches: ['main'], preview: none })).toBe('deploy')
    expect(resolveSshNextStep({ branchMissing: false, branches: [], preview: undefined })).toBe('deploy')
  })
})

describe('resolveSshDefaultBranch', () => {
  it('keeps the connected branch when found', () => {
    expect(resolveSshDefaultBranch({ branchMissing: false, branches: ['a', 'main'], connectedBranch: 'main' })).toBe('main')
  })

  it('preselects the only remote branch when the branch is missing', () => {
    expect(resolveSshDefaultBranch({ branchMissing: true, branches: ['trunk'], connectedBranch: 'main' })).toBe('trunk')
  })

  it('preselects nothing with 0 or many branches when missing', () => {
    expect(resolveSshDefaultBranch({ branchMissing: true, branches: [], connectedBranch: 'main' })).toBeNull()
    expect(resolveSshDefaultBranch({ branchMissing: true, branches: ['a', 'b'], connectedBranch: 'main' })).toBeNull()
  })
})
