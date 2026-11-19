const UNITS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

/**
 * Base 1024, up to two decimals with
 * trailing zeros dropped (`1.5 GB`, not `1.50 GB`). `0` and `null` are `'0 B'`; a value under one byte keeps one decimal and the
 * long unit (`0.5 Bytes`). Not the same as the private `formatBytes` of `instances.mapper.ts`, which rounds differently.
 */
export function formatBytes (bytes: number | string | null, decimals = 2): string {
  if (bytes === null || [0, '0'].includes(bytes)) {
    return '0 B'
  }
  const value = Number(bytes)
  if (value < 1) {
    return `${value.toFixed(1)} Bytes`
  }

  const k = 1024
  const dm = Math.max(decimals, 0)
  const i = Math.floor(Math.log(value) / Math.log(k))

  return `${Number.parseFloat((value / (k ** i)).toFixed(dm))} ${UNITS[i]}`
}
