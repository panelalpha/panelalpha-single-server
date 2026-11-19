/**
 * English `moment(date).fromNow()` without the dependency (moment 2.29, default `relativeTime` thresholds
 * `ss: 44, s: 45, m: 45, h: 22, d: 26, M: 11`; legacy never sets `moment.locale`, so the text is always English).
 *
 * moment measures the distance as whole calendar months plus a millisecond remainder (`momentsDifference`), then
 * converts that pair to each unit with `monthsToDays = 146097 * months / 4800`. The same is done here, in local time.
 */

const DAY_MS = 864e5

function monthsToDays (months: number): number {
  return (months * 146_097) / 4800
}

function daysToMonths (days: number): number {
  return (days * 4800) / 146_097
}

/** moment `add(months, 'M')`: the day of month is clamped to the length of the target month. */
function addMonths (date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDay))
  return result
}

/** moment `positiveMomentsDifference(base, other)` with `base <= other`. */
function positiveDifference (base: Date, other: Date): { months: number, ms: number } {
  let months = other.getMonth() - base.getMonth() + (other.getFullYear() - base.getFullYear()) * 12
  if (addMonths(base, months).getTime() > other.getTime()) {
    months -= 1
  }
  return { months, ms: other.getTime() - addMonths(base, months).getTime() }
}

function plural (count: number, one: string, many: string): string {
  return count <= 1 ? one : `${count} ${many}`
}

export function fromNow (date: string | Date, now: Date = new Date()): string {
  const target = new Date(date)
  const diff = target.getTime() - now.getTime()
  if (Number.isNaN(diff)) {
    return 'Invalid date'
  }

  const { months, ms } = diff >= 0 ? positiveDifference(now, target) : positiveDifference(target, now)
  const wholeDays = Math.round(monthsToDays(months))

  const seconds = Math.round((wholeDays * DAY_MS + ms) / 1000)
  const minutes = Math.round((wholeDays * 1440) + ms / 6e4)
  const hours = Math.round((wholeDays * 24) + ms / 36e5)
  const days = Math.round(wholeDays + ms / DAY_MS)
  const monthsTotal = Math.round(months + daysToMonths(ms / DAY_MS))
  const years = Math.round((months + daysToMonths(ms / DAY_MS)) / 12)

  let text: string
  if (seconds <= 44) {
    text = 'a few seconds'
  } else if (minutes <= 1) {
    text = 'a minute'
  } else if (minutes < 45) {
    text = `${minutes} minutes`
  } else if (hours <= 1) {
    text = 'an hour'
  } else if (hours < 22) {
    text = `${hours} hours`
  } else if (days <= 1) {
    text = 'a day'
  } else if (days < 26) {
    text = `${days} days`
  } else if (monthsTotal <= 1) {
    text = 'a month'
  } else if (monthsTotal < 11) {
    text = `${monthsTotal} months`
  } else {
    text = plural(years, 'a year', 'years')
  }

  return diff > 0 ? `in ${text}` : `${text} ago`
}
