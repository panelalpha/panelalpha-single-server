// Local-time date formatting that stands in for `moment(value).format('YYYY-MM-DD HH:mm')` (no `moment` dependency).
// Moved out of `entities/project/ui/deploy/deploy-log-ui.ts` so the Connect AI token and log cells share it.

const INVALID_DATE = 'Invalid date'

function pad (value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocal (date: Date, withSeconds: boolean): string {
  if (Number.isNaN(date.getTime())) {
    // moment(...).format(...) answers 'Invalid date' for an unparsable value.
    return INVALID_DATE
  }
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${day} ${withSeconds ? `${time}:${pad(date.getSeconds())}` : time}`
}

// `moment('YYYY-MM-DD[ T]HH:mm[:ss]')` is local time (the API sends zone-less strings); `new Date()` parses
// the date-only form as UTC and the space form implementation-dependently, so those are built from parts.
// An ISO string with a zone (`...Z`) does not match and goes through `new Date`, as moment does.
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

export function parseDate (value: string | number | Date): Date {
  if (typeof value === 'string') {
    const match = LOCAL_DATE_RE.exec(value.trim())
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour ?? 0),
        Number(minute ?? 0),
        Number(second ?? 0),
      )
    }
  }
  return new Date(value)
}

// WordPress stores its own timestamps (the `wp ... list --format=json` dates such as `user_registered`) in UTC
// without a zone, so `parseDate` would read them as local time. Those are built from parts in UTC; a value that
// carries a zone does not match and goes through `new Date`.
const WORDPRESS_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

/** A WordPress timestamp of the shape `YYYY-MM-DD HH:mm:ss`, read as the UTC instant it is. */
export function parseWordPressDate (value: string): Date {
  const match = WORDPRESS_DATE_RE.exec(value.trim())
  if (!match) {
    return new Date(value)
  }
  const [, year, month, day, hour, minute, second] = match
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  ))
}

/** `moment(value).format('YYYY-MM-DD HH:mm')`: local time, `'Invalid date'` for an unparsable value. */
export function formatDateTime (value: string | number | Date): string {
  return formatLocal(parseDate(value), false)
}
