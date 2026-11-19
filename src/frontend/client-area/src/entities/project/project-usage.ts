import type { ProjectLimitValues, ProjectResources } from '@/entities/project/instance-resource'
import { formatBytes } from '@/shared/format/format-bytes'

const MB = 1024 * 1024
const KEY = 'heading.instance.advanced.projectLimits.summary'

export type Translate = (key: string, options: { [name: string]: unknown, defaultValue: string }) => string

/** Used when no translator is given: the English default of the key. */
const english: Translate = (_key, options) => options.defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name] ?? ''))

export type UsageNote = 'perCore' | 'noData' | 'unlimited' | 'ofServer'

/**
 * The size of the whole server (`GET /server/metrics/current`, single server only), in bytes; null when it is not known.
 * A RAM or disk ring without a limit is measured against it.
 */
export interface ServerTotals {
  memoryBytes: number | null
  diskBytes: number | null
}

export interface UsageRing {
  /** Whole percent (rounded up, at most 100), or null when there is nothing to draw. */
  percent: number | null
  used: string
  /** Null when the limit is not set or unlimited. */
  limit: string | null
  /**
   * `perCore`: the percent is of one core and `used` is the bare number, the caption adds the "% of 1 core" text.
   * `noData`: no recent sample. `unlimited`: no limit and no server size to measure against.
   * `ofServer`: no limit, so the percent is of the whole server, whose size is in `server`.
   */
  note?: UsageNote
  /** The size of the server, set with `ofServer`. */
  server?: string
}

export interface UsageRings {
  ram: UsageRing
  cpu: UsageRing
  disk: UsageRing
}

export interface LimitsSummary {
  main: string[]
  more: number
}

/** Same rounding as `usedPercent` in `plan-usage.ts`: up to a whole number, never above 100. */
function toPercent (value: number): number {
  return Math.min(100, Math.max(0, Math.ceil(value)))
}

function isPositive (value: number | null | undefined): value is number {
  return typeof value === 'number' && value > 0
}

/** A limit counts as set when it is above 0: `-1` and `0` both mean no limit in the Engine (old data may hold `0`), null is not set. */
function isSet (value: number | null | undefined): value is number {
  return typeof value === 'number' && value > 0
}

function coresText (cores: number, t: Translate): string {
  return cores === 1
    ? t(`${KEY}.core`, { count: cores, defaultValue: '{{count}} core' })
    : t(`${KEY}.cores`, { count: cores, defaultValue: '{{count}} cores' })
}

function noData (): UsageRing {
  return { percent: null, used: '', limit: null, note: 'noData' }
}

/** A ring without a limit: the percent of the whole server when its size is known, otherwise no percent. */
function unlimited (usedBytes: number, serverBytes: number | null | undefined): UsageRing {
  const used = formatBytes(usedBytes)
  if (!isPositive(serverBytes)) {
    return { percent: null, used, limit: null, note: 'unlimited' }
  }
  return { percent: toPercent(usedBytes / serverBytes * 100), used, limit: null, note: 'ofServer', server: formatBytes(serverBytes) }
}

function ramRing (resources: ProjectResources, isContainer: boolean, server: ServerTotals | null): UsageRing {
  const { usage, limits } = resources
  if (usage === null || usage.memory_bytes === null) {
    return noData()
  }

  // A container (DinD) project applies a new memory limit at once, so the saved setting is first. A classic project applies it
  // only after a rebuild, so the limit the sample reports is the one in force, and the setting is only a fallback.
  const saved = isPositive(limits.memory_limit) ? limits.memory_limit * MB : null
  const sampled = isPositive(usage.memory_limit_bytes) ? usage.memory_limit_bytes : null
  const limitBytes = isContainer ? (saved ?? sampled) : (sampled ?? saved)

  if (limitBytes === null) {
    return unlimited(usage.memory_bytes, server?.memoryBytes)
  }
  return { percent: toPercent(usage.memory_bytes / limitBytes * 100), used: formatBytes(usage.memory_bytes), limit: formatBytes(limitBytes) }
}

function cpuRing (resources: ProjectResources, t: Translate): UsageRing {
  const { usage, limits } = resources
  if (usage === null || usage.cpu_percent === null) {
    return noData()
  }

  if (isPositive(limits.cpu_limit)) {
    return {
      percent: toPercent(usage.cpu_percent / (limits.cpu_limit * 100) * 100),
      used: coresText(Math.round(usage.cpu_percent) / 100, t),
      limit: coresText(limits.cpu_limit, t),
    }
  }
  return { percent: toPercent(usage.cpu_percent), used: String(Math.round(usage.cpu_percent)), limit: null, note: 'perCore' }
}

function diskRing (resources: ProjectResources, server: ServerTotals | null): UsageRing {
  const { disk } = resources
  if (disk === null || disk.total_bytes === null) {
    return noData()
  }

  if (!isPositive(disk.limit_bytes)) {
    return unlimited(disk.total_bytes, server?.diskBytes)
  }
  return { percent: toPercent(disk.total_bytes / disk.limit_bytes * 100), used: formatBytes(disk.total_bytes), limit: formatBytes(disk.limit_bytes) }
}

/**
 * The three rings of the Project usage cards, from the raw `resources` block. `server` (single server only) gives RAM and disk without
 * a limit a percent of the whole server. CPU without a limit stays the percent of one core: the client gets no core count of the server.
 */
export function usageRings (resources: ProjectResources, t: Translate = english, isContainer = false, server: ServerTotals | null = null): UsageRings {
  return { ram: ramRing(resources, isContainer, server), cpu: cpuRing(resources, t), disk: diskRing(resources, server) }
}

/** The server size from `GET /server/metrics/current`: RAM comes in KB, disk in bytes (null on an engine that cannot measure it). */
export function serverTotals (metrics: { ram_total?: number | null, disk_total?: number | null }): ServerTotals {
  return {
    memoryBytes: isPositive(metrics.ram_total) ? metrics.ram_total * 1024 : null,
    diskBytes: isPositive(metrics.disk_total) ? metrics.disk_total : null,
  }
}

/** "2 GB RAM", "1 core CPU", "10 GB disk" for the main limits that are set, and how many of the other limits are set. */
export function limitsSummary (limits: ProjectLimitValues, t: Translate = english): LimitsSummary {
  const main: string[] = []
  if (isSet(limits.memory_limit)) {
    main.push(t(`${KEY}.ram`, { value: formatBytes(limits.memory_limit * MB), defaultValue: '{{value}} RAM' }))
  }
  if (isSet(limits.cpu_limit)) {
    main.push(t(`${KEY}.cpu`, { value: coresText(limits.cpu_limit, t), defaultValue: '{{value}} CPU' }))
  }
  if (isSet(limits.disk_space_limit)) {
    main.push(t(`${KEY}.disk`, { value: formatBytes(limits.disk_space_limit * MB), defaultValue: '{{value}} disk' }))
  }

  const more = [limits.inodes_limit, limits.device_read_bps, limits.device_write_bps].filter(value => isSet(value)).length
  return { main, more }
}
