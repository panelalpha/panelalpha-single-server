import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ORDER,
  hydrateIssue,
  type InstanceLike,
  ISSUE_REGISTRY,
} from './issue-registry'

describe('issue registry constants', () => {
  it('keeps the legacy values (issueRegistry.js:1-7)', () => {
    expect(CATEGORY_ORDER).toEqual(['deploy', 'wordpress', 'woocommerce', 'backup'])
    expect(Object.keys(ISSUE_REGISTRY).toSorted()).toEqual([
      'backup.attention',
      'deploy.drift.port',
      'deploy.drift.runtime',
      'deploy.drift.strategy',
      'deploy.last_deploy_warnings',
      'deploy.missing_index',
      'deploy.not_deployable',
      'deploy.port_mismatch',
      'woocommerce.outdated',
      'wordpress.core_outdated',
    ])
  })
})

describe('deploy.* source warnings (legacy issueRegistry.js:81-110)', () => {
  const instance: InstanceLike = { id: 7 }

  it.each([
    ['deploy.not_deployable', 'error', 'heading.instance.statusIndicator.deploy.notDeployable.title'],
    ['deploy.last_deploy_warnings', 'warning', 'heading.instance.statusIndicator.deploy.lastDeployWarnings.title'],
    ['deploy.drift.strategy', 'warning', 'heading.instance.statusIndicator.deploy.drift.strategy.title'],
    ['deploy.drift.runtime', 'warning', 'heading.instance.statusIndicator.deploy.drift.runtime.title'],
    ['deploy.drift.port', 'warning', 'heading.instance.statusIndicator.deploy.drift.port.title'],
  ])('%s has severity and title key, and no action button', (code, severity, titleKey) => {
    const issue = hydrateIssue({ code, category: 'deploy', title: 'Engine text', detail: 'line 1\nline 2' }, instance)
    expect(issue).toMatchObject({ severity, titleKey, action: null, solutions: [], showAction: false })
    expect(issue.title).toBe('Engine text')
    expect(issue.detail).toBe('line 1\nline 2')
  })
})

describe('hydrateIssue', () => {
  const instance: InstanceLike = { id: 7 }

  it('wordpress.core_outdated: navigate action gated by the update privilege', () => {
    const issue = hydrateIssue({ code: 'wordpress.core_outdated', category: 'wordpress' }, instance)
    expect(issue.titleKey).toBe('heading.instance.statusIndicator.wordpress.outdated.title')
    expect(issue.labelKey).toBe('button.update')
    expect(issue.showAction).toBe(true)
    expect(issue.action?.type === 'navigate' && issue.action.to(instance)).toBe('7/general')
    const denied = hydrateIssue(
      { code: 'wordpress.core_outdated', category: 'wordpress' },
      { id: 7, hasWordPressUpdatePrivilege: () => false },
    )
    expect(denied.showAction).toBe(false)
  })

  it('woocommerce.outdated: navigates to plugins, gated by the update privilege', () => {
    const issue = hydrateIssue({ code: 'woocommerce.outdated', category: 'woocommerce' }, instance)
    expect(issue.action?.type === 'navigate' && issue.action.to(instance)).toBe('7/plugins')
    expect(issue.showAction).toBe(true)
    expect(hydrateIssue(
      { code: 'woocommerce.outdated', category: 'woocommerce' },
      { id: 7, hasWordPressUpdatePrivilege: () => false },
    ).showAction).toBe(false)
  })

  it('backup.attention: copy depends on autoOff / noRecent (issueRegistry.js:99-119)', () => {
    const both = hydrateIssue({ code: 'backup.attention', category: 'backup', params: { autoOff: true, noRecent: true } }, instance)
    expect(both).toMatchObject({
      titleKey: 'heading.instance.statusIndicator.backup.noRecent.title',
      descriptionKey: 'heading.instance.statusIndicator.backup.autoOff.description',
      labelKey: 'button.statusIndicator.enableBackups',
      severity: 'error',
    })
    const autoOff = hydrateIssue({ code: 'backup.attention', category: 'backup', params: { autoOff: true, noRecent: false } }, instance)
    expect(autoOff).toMatchObject({
      titleKey: 'heading.instance.statusIndicator.backup.autoOff.title',
      descriptionKey: 'heading.instance.statusIndicator.backup.autoOff.hint',
      labelKey: 'button.statusIndicator.enableBackups',
    })
    const noRecent = hydrateIssue({ code: 'backup.attention', category: 'backup', params: { autoOff: false, noRecent: true } }, instance)
    expect(noRecent).toMatchObject({
      titleKey: 'heading.instance.statusIndicator.backup.noRecent.title',
      descriptionKey: 'heading.instance.statusIndicator.backup.noRecent.hint',
      labelKey: 'button.statusIndicator.viewBackups',
    })
    expect(noRecent.action?.type === 'navigate' && noRecent.action.to(instance)).toBe('7/backups')
    expect(noRecent.showAction).toBe(true)
  })

  it('deploy.missing_index: modal action with the upload solution only', () => {
    const issue = hydrateIssue({ code: 'deploy.missing_index', category: 'deploy' }, instance)
    expect(issue.action).toEqual({ type: 'openModal' })
    expect(issue.showAction).toBe(true)
    expect(issue.solutions.map(s => s.ui)).toEqual(['upload-archive'])
    expect(issue.modalTitleKey).toBe('heading.instance.statusIndicator.deploy.missingIndex.modalTitle')
    const allowed = hydrateIssue({ code: 'deploy.missing_index', category: 'deploy' }, { hasRedeployPrivilege: () => true })
    expect(allowed.solutions.map(s => s.ui)).toEqual(['upload-archive'])
  })

  it('deploy.port_mismatch: upload solution only, params kept', () => {
    const issue = hydrateIssue({ code: 'deploy.port_mismatch', category: 'deploy', params: { port: 3000 } }, instance)
    expect(issue.solutions.map(s => s.ui)).toEqual(['upload-archive'])
    expect(issue.params).toEqual({ port: 3000 })
  })

  it('without the redeploy privilege a deploy issue has no solution and no action (legacy :122-150)', () => {
    for (const code of ['deploy.missing_index', 'deploy.port_mismatch']) {
      const denied = hydrateIssue({ code, category: 'deploy' }, { hasRedeployPrivilege: () => false })
      expect(denied.solutions).toEqual([])
      expect(denied.showAction).toBe(false)
    }
  })

  it('an Engine check keeps its own text and has no action', () => {
    const issue = hydrateIssue(
      { code: 'deploy.check.x', category: 'deploy', title: 'Check', detail: 'Detail' },
      instance,
    )
    expect(issue).toMatchObject({ title: 'Check', detail: 'Detail', action: null, solutions: [], showAction: false })
  })

  it('does not mutate the registry solutions when filtering', () => {
    hydrateIssue({ code: 'deploy.missing_index', category: 'deploy' }, { hasRedeployPrivilege: () => false })
    expect(ISSUE_REGISTRY['deploy.missing_index']!.solutions).toHaveLength(1)
  })

  it('unknown code falls back to the code as title and no action (issueRegistry.js:122-133)', () => {
    expect(hydrateIssue({ code: 'x.unknown', category: 'x' }, instance)).toEqual({
      code: 'x.unknown',
      category: 'x',
      titleKey: 'x.unknown',
      descriptionKey: '',
      labelKey: '',
      action: null,
      solutions: [],
      showAction: false,
    })
  })
})
