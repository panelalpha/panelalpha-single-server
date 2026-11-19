import type { ServerMetricsCurrent } from '@/views/hosting/hosting.types'

export interface UsageCardValues {
  ramPercent: number
  cpuPercent: number
  diskPercent: number
  /** A string with two decimals, or the number `0` before the data arrives (legacy renders "0 GB", not "0.00 GB"). */
  ramUsedGb: string | number
  ramFreeGb: string | number
  diskUsedGb: string | number
  diskFreeGb: string | number
}

const KB_PER_GB = 1024 * 1024
const BYTES_PER_GB = 1024 * 1024 * 1024

const toGb = (value: number, divisor: number): string => (Math.round((value / divisor) * 100) / 100).toFixed(2)

/** Free space from the engine, or total minus used when the engine does not send it (old engine, null disk_free). */
function freeOf (free: number | null | undefined, total: number, used: number): number {
  return typeof free === 'number' ? Math.max(free, 0) : Math.max(total - used, 0)
}

/** RAM comes in KB, disk in bytes. Without metrics every value is the number `0`. */
export function usageCardValues (metrics: ServerMetricsCurrent | null): UsageCardValues {
  if (metrics === null) {
    return { ramPercent: 0, cpuPercent: 0, diskPercent: 0, ramUsedGb: 0, ramFreeGb: 0, diskUsedGb: 0, diskFreeGb: 0 }
  }
  return {
    ramPercent: Math.ceil(metrics.ram_usage_percent),
    cpuPercent: Math.ceil(metrics.cpu_usage_percent),
    diskPercent: Math.ceil(metrics.disk_usage_percent),
    ramUsedGb: toGb(metrics.ram_used, KB_PER_GB),
    ramFreeGb: toGb(freeOf(metrics.ram_free, metrics.ram_total, metrics.ram_used), KB_PER_GB),
    diskUsedGb: toGb(metrics.disk_used, BYTES_PER_GB),
    diskFreeGb: toGb(freeOf(metrics.disk_free, metrics.disk_total, metrics.disk_used), BYTES_PER_GB),
  }
}
