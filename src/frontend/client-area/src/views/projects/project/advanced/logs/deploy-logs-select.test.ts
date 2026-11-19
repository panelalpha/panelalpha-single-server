import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
import { describe, expect, it } from 'vitest'
import { formatSelectDate } from '@/entities/project/ui/deploy/deploy-log-ui'
import { deploySelectLabel, deploySourceLabel } from './deploy-logs-select'

const t = (key: string) => key

function run (overrides: Partial<DeployLogEntry> = {}): DeployLogEntry {
  return { id: 1, status: 'success', started_at: '2026-10-19T08:30:00Z', created_at: '2026-10-19T08:29:00Z', source_type: 'git', ...overrides }
}

describe('deploySelectLabel', () => {
  it('joins the start date and the status key', () => {
    expect(deploySelectLabel(run(), t)).toBe(`${formatSelectDate('2026-10-19T08:30:00Z')} · deployLogs.status.success`)
  })

  it('falls back to created_at when the run has not started', () => {
    expect(deploySelectLabel(run({ started_at: null }), t))
      .toBe(`${formatSelectDate('2026-10-19T08:29:00Z')} · deployLogs.status.success`)
  })

  it('shows a dash when there is no date at all', () => {
    expect(deploySelectLabel(run({ started_at: null, created_at: null }), t)).toBe('— · deployLogs.status.success')
  })

  it('uses the status of the run', () => {
    expect(deploySelectLabel(run({ status: 'running' }), t)).toMatch(/deployLogs\.status\.running$/)
  })
})

describe('deploySourceLabel', () => {
  it('translates the source type', () => {
    expect(deploySourceLabel(run({ source_type: 'files' }), t)).toBe('deployLogs.source.files')
  })
})
