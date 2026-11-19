import type { InstanceLike } from './issue-registry'
import { describe, expect, it } from 'vitest'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { type AppHealth, collectInstanceIssues, deployIssuesFromHealth, deployIssuesFromInstance, deployIssuesFromSource, uniqueIssues } from './collect-instance-issues'

const codes = (instance: InstanceLike) => collectInstanceIssues(instance).map(i => i.code)

describe('collectInstanceIssues', () => {
  it('reports nothing for an up-to-date wordpress instance', () => {
    expect(codes({ type: 'wordpress', status: { wordpress: '6.5', wordpress_available: '6.5' } })).toEqual([])
    expect(codes({})).toEqual([])
  })

  it('compares versions as numbers, not as text', () => {
    expect(codes({ type: 'wordpress', status: { wordpress: '6.5', wordpress_available: '6.5.0' } })).toEqual([])
    expect(codes({ status: { woocommerce: '8.1.0', woocommerce_available: '8.1' } })).toEqual([])
    expect(codes({ status: { woocommerce: '9.0.0', woocommerce_available: '11.3.0' } })).toEqual(['woocommerce.outdated'])
    expect(codes({ type: 'wordpress', status: { wordpress: '9.9.0', wordpress_available: '10.0.0' } })).toEqual(['wordpress.core_outdated'])
    expect(codes({ status: { woocommerce: '11.3.0', woocommerce_available: '9.0.0' } })).toEqual([])
  })

  it('reports nothing when no available version is known', () => {
    expect(codes({ type: 'wordpress', status: { wordpress: '6.5', wordpress_available: '' } })).toEqual([])
    expect(codes({ type: 'wordpress', status: { wordpress: '6.5', wordpress_available: null } })).toEqual([])
    expect(codes({ status: { woocommerce: '8.0' } })).toEqual([])
  })

  it('wordpress.core_outdated on and off (legacy collectInstanceIssues.js:48-57)', () => {
    const on = collectInstanceIssues({ status: { wordpress: '6.4', wordpress_available: '6.5' } })
    expect(on).toEqual([{
      code: 'wordpress.core_outdated',
      category: 'wordpress',
      params: { current: '6.4', available: '6.5' },
    }])
    // not installed
    expect(codes({ status: { wordpress: null, wordpress_available: '6.5' } })).toEqual([])
    // type other than wordpress
    expect(codes({ type: 'custom', status: { wordpress: '6.4', wordpress_available: '6.5' } }))
      .not
      .toContain('wordpress.core_outdated')
  })

  it('woocommerce.outdated on and off (legacy :59-68)', () => {
    expect(collectInstanceIssues({ status: { woocommerce: '8.0', woocommerce_available: '8.1' } })).toEqual([{
      code: 'woocommerce.outdated',
      category: 'woocommerce',
      params: { current: '8.0', available: '8.1' },
    }])
    expect(codes({ status: { woocommerce: undefined, woocommerce_available: '8.1' } })).toEqual([])
    expect(codes({ status: { woocommerce: '8.1', woocommerce_available: '8.1' } })).toEqual([])
  })

  it('raises no deploy issue for custom instances (they come from app-health; legacy :18-22)', () => {
    expect(collectInstanceIssues({ type: 'custom' })).toEqual([])
    expect(codes({ type: 'wordpress' })).toEqual([])
  })

  it('backup.attention on and off with autoOff / noRecent params (legacy :70-86)', () => {
    expect(collectInstanceIssues({ hasAutomaticBackup: () => false })).toEqual([{
      code: 'backup.attention', category: 'backup', params: { autoOff: true, noRecent: false },
    }])
    expect(collectInstanceIssues({
      hasAutomaticBackup: () => true,
      hasRecentBackup: () => false,
      shouldHaveRecentBackup: () => true,
    })).toEqual([{
      code: 'backup.attention', category: 'backup', params: { autoOff: false, noRecent: true },
    }])
    expect(codes({
      hasAutomaticBackup: () => true,
      hasRecentBackup: () => false,
      shouldHaveRecentBackup: () => false,
    })).toEqual([])
    expect(codes({
      hasAutomaticBackup: () => true,
      hasRecentBackup: () => true,
      shouldHaveRecentBackup: () => true,
    })).toEqual([])
    // Missing methods mean "no issue"
    expect(codes({ hasRecentBackup: () => false })).toEqual([])
  })

  it('backup.attention is absent for a real resource with unknown (null) schedule', () => {
    const base = { id: 1, type: 'wordpress', name: 'A', url: 'https://a.example.com', domain: 'a.example.com', has_automatic_backup: null, service_created_at: new Date().toISOString() } as unknown as RawInstance
    const instance = toInstanceResource(base)
    expect(instance.status.backup).toBe(true)
    expect(codes(instance)).not.toContain('backup.attention')
    instance.setAutomaticBackup(false)
    expect(codes(instance)).toContain('backup.attention')
  })
})

describe('deployIssuesFromInstance', () => {
  it('reports nothing unless the Engine recorded a partial deploy', () => {
    expect(deployIssuesFromInstance(null)).toEqual([])
    expect(deployIssuesFromInstance(undefined)).toEqual([])
    expect(deployIssuesFromInstance({})).toEqual([])
    expect(deployIssuesFromInstance({ deployment_status: 'success', deployment_warnings: [{ message: 'stale' }] })).toEqual([])
    expect(deployIssuesFromInstance({ deployment_status: 'failed', deployment_warnings: [{ message: 'stale' }] })).toEqual([])
  })

  it('names the Engine findings of a partial deploy, one warning per line', () => {
    expect(deployIssuesFromInstance({
      deployment_status: 'partial',
      deployment_warnings: [
        { code: 'app_not_answering', message: 'The application started but did not answer on any port it publishes.' },
        { code: 'health_check_failed', message: 'The application is restarting, not running.' },
        { code: 'redacted', message: '  ' },
      ],
    })).toEqual([{
      code: 'deploy.last_deploy_warnings',
      category: 'deploy',
      params: {},
      title: null,
      detail: 'The application started but did not answer on any port it publishes.\nThe application is restarting, not running.',
    }])
  })

  it('reads an older Engine that stored the warnings as sentences, and a partial deploy without any', () => {
    expect(deployIssuesFromInstance({ deployment_status: 'partial', deployment_warnings: ['Mail host unreachable'] })).toEqual([{
      code: 'deploy.last_deploy_warnings',
      category: 'deploy',
      params: {},
      title: null,
      detail: 'Mail host unreachable',
    }])
    // The state alone warns: the registry's title and description say it, the Engine gave no text.
    expect(deployIssuesFromInstance({ deployment_status: 'partial' })).toEqual([
      { code: 'deploy.last_deploy_warnings', category: 'deploy', params: {}, title: null, detail: null },
    ])
  })

  it('is the first issue of the project and survives its own duplication', () => {
    const base = { id: 1, type: 'custom', name: 'A', url: 'https://a.example.com', domain: 'a.example.com' } as unknown as RawInstance
    const instance = toInstanceResource({
      ...base,
      details: { deployment_status: 'partial', deployment_warnings: [{ code: 'app_not_answering', message: 'Nothing answers.' }] },
    })

    expect(codes(instance)).toEqual(['deploy.last_deploy_warnings'])
    expect(collectInstanceIssues(instance)[0]!.detail).toBe('Nothing answers.')

    // `/source` and the payload both report the deploy: one warning in the menu, not two.
    expect(uniqueIssues([
      { code: 'deploy.last_deploy_warnings', category: 'deploy', detail: 'from the payload' },
      { code: 'deploy.last_deploy_warnings', category: 'deploy', detail: 'from the source' },
      { code: 'deploy.port_mismatch', category: 'deploy' },
    ])).toEqual([
      { code: 'deploy.last_deploy_warnings', category: 'deploy', detail: 'from the payload' },
      { code: 'deploy.port_mismatch', category: 'deploy' },
    ])
  })
})

describe('deployIssuesFromHealth', () => {
  const health = (over: Partial<AppHealth> = {}): AppHealth => ({
    available: true,
    healthy: true,
    serving: 'ok',
    ports: [{ port: 8080, status: 'ok', http_code: 200, detail: 'HTTP 200' }],
    checks: [],
    ...over,
  })

  it('shows nothing before the probe answers or for a project it does not probe', () => {
    expect(deployIssuesFromHealth(null)).toEqual([])
    expect(deployIssuesFromHealth(undefined)).toEqual([])
    expect(deployIssuesFromHealth({ available: false })).toEqual([])
  })

  it('shows nothing for an application that serves itself', () => {
    expect(deployIssuesFromHealth(health())).toEqual([])
  })

  it('reports a missing index file in the Engine\'s words', () => {
    const issues = deployIssuesFromHealth(health({
      serving: 'missing_entry',
      ports: [{ port: 8080, status: 'ok', http_code: 403, detail: 'HTTP 403' }],
      checks: [
        { id: 'entry-served', severity: 'error', title: 'The front page is missing: / answered 403.', detail: null, fix: null },
      ],
    }))

    expect(issues).toEqual([{
      code: 'deploy.missing_index',
      category: 'deploy',
      params: {},
      detail: 'The front page is missing: / answered 403.',
    }])
  })

  it('reports the routed port when nothing answers on any published port', () => {
    const issues = deployIssuesFromHealth(health({
      healthy: false,
      serving: 'unknown',
      ports: [
        { port: 3000, status: 'fail', http_code: null, detail: 'connection refused' },
        { port: 8080, status: 'fail', http_code: null, detail: 'connection refused' },
      ],
      checks: [
        { id: 'no-service-unreachable', severity: 'error', title: 'Nothing answers.', detail: null, fix: null },
      ],
    }))

    expect(issues).toEqual([{ code: 'deploy.port_mismatch', category: 'deploy', params: { port: 3000 } }])
  })

  it('does not blame the port for a container that keeps restarting or is stopped', () => {
    const restarting = deployIssuesFromHealth(health({
      healthy: false,
      serving: 'restarting',
      ports: [{ port: 8080, status: 'fail', http_code: null, detail: 'connection refused' }],
      checks: [
        { id: 'app-restart-looping', severity: 'error', title: 'The application keeps restarting.', detail: 'exit code 1', fix: null },
      ],
    }))

    expect(restarting.map(issue => issue.code)).toEqual(['deploy.check.app-restart-looping'])
    expect(restarting[0]!.title).toBe('The application keeps restarting.')
    expect(restarting[0]!.detail).toBe('exit code 1')

    const stopped = deployIssuesFromHealth(health({
      healthy: false,
      serving: 'stopped',
      ports: [{ port: 8080, status: 'fail', http_code: null, detail: 'connection refused' }],
    }))
    expect(stopped).toEqual([])
  })

  it('shows every other failing check with its own title and its fix when there is no detail', () => {
    const issues = deployIssuesFromHealth(health({
      serving: 'placeholder',
      checks: [
        { id: 'not-placeholder', severity: 'error', title: 'The Engine\'s placeholder page answers.', detail: null, fix: 'Deploy the application.' },
      ],
    }))

    expect(issues).toEqual([{
      code: 'deploy.check.not-placeholder',
      category: 'deploy',
      params: {},
      title: 'The Engine\'s placeholder page answers.',
      detail: 'Deploy the application.',
    }])
  })

  it('orders the missing index, then the port, then the other checks in the Engine\'s order', () => {
    const issues = deployIssuesFromHealth(health({
      healthy: false,
      serving: 'missing_entry',
      ports: [{ port: 3000, status: 'fail', http_code: null, detail: 'connection refused' }],
      checks: [
        { id: 'app-crash', severity: 'error', title: 'The application crashed.', detail: null, fix: null },
        { id: 'entry-served', severity: 'error', title: 'The front page is missing.', detail: null, fix: null },
        { id: 'no-service-unreachable', severity: 'error', title: 'Nothing answers.', detail: null, fix: null },
        { id: 'disk-full', severity: 'warning', title: 'The disk is almost full.', detail: null, fix: null },
      ],
    }))

    expect(issues.map(issue => issue.code)).toEqual([
      'deploy.missing_index',
      'deploy.port_mismatch',
      'deploy.check.app-crash',
      'deploy.check.disk-full',
    ])
  })

  it('shows a named check as its own issue when the matching deploy issue is not raised', () => {
    const issues = deployIssuesFromHealth(health({
      checks: [
        { id: 'entry-served', severity: 'warning', title: 'The front page answered slowly.', detail: null, fix: null },
        { id: 'no-service-unreachable', severity: 'warning', title: 'One port did not answer.', detail: null, fix: null },
      ],
    }))

    expect(issues.map(issue => issue.code)).toEqual(['deploy.check.entry-served', 'deploy.check.no-service-unreachable'])
  })
})

describe('deployIssuesFromSource', () => {
  it('reports nothing when the source is missing or unavailable', () => {
    expect(deployIssuesFromSource(null)).toEqual([])
    expect(deployIssuesFromSource(undefined)).toEqual([])
    expect(deployIssuesFromSource({ available: false, warnings: [{ code: 'deploy.not_deployable' }] })).toEqual([])
  })

  it('maps each warning to a deploy issue with the Engine title and details joined by a newline', () => {
    const issues = deployIssuesFromSource({
      available: true,
      warnings: [
        { code: 'deploy.drift.port', title: 'Port changed', details: ['Was 3000', '', 'Now 8080'] },
        { code: 'deploy.last_deploy_warnings', title: null, details: [] },
      ],
    })
    expect(issues).toEqual([
      { code: 'deploy.drift.port', category: 'deploy', params: {}, title: 'Port changed', detail: 'Was 3000\nNow 8080' },
      { code: 'deploy.last_deploy_warnings', category: 'deploy', params: {}, title: null, detail: null },
    ])
  })

  it('puts deploy.not_deployable first and keeps the rest in the API order', () => {
    const issues = deployIssuesFromSource({
      available: true,
      warnings: [
        { code: 'deploy.drift.runtime' },
        { code: 'deploy.drift.strategy' },
        { code: 'deploy.not_deployable' },
        { code: 'deploy.last_deploy_warnings' },
      ],
    })
    expect(issues.map(issue => issue.code)).toEqual([
      'deploy.not_deployable',
      'deploy.drift.runtime',
      'deploy.drift.strategy',
      'deploy.last_deploy_warnings',
    ])
  })
})
