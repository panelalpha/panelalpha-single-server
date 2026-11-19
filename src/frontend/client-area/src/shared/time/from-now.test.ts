import { describe, expect, it } from 'vitest'
import { fromNow } from './from-now'

// Expected strings are outputs of moment 2.29.4 (`moment(target).from(moment(now))`, default English `relativeTime`).
const NOW = new Date(2026, 0, 15, 12, 0, 0)
const S = 1000
const MIN = 60 * S
const H = 60 * MIN
const D = 24 * H

function at (offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs)
}

// [label, offset ms, past text, future text]
const boundaries: Array<[string, number, string, string]> = [
  ['0s', 0, 'a few seconds ago', 'a few seconds ago'],
  ['44s', 44 * S, 'a few seconds ago', 'in a few seconds'],
  ['44.4s', 44_400, 'a few seconds ago', 'in a few seconds'],
  ['45s', 45 * S, 'a minute ago', 'in a minute'],
  ['89s', 89 * S, 'a minute ago', 'in a minute'],
  ['90s', 90 * S, '2 minutes ago', 'in 2 minutes'],
  ['44min', 44 * MIN, '44 minutes ago', 'in 44 minutes'],
  ['44min 29s', 44 * MIN + 29 * S, '44 minutes ago', 'in 44 minutes'],
  ['44min 30s', 44 * MIN + 30 * S, 'an hour ago', 'in an hour'],
  ['45min', 45 * MIN, 'an hour ago', 'in an hour'],
  ['89min', 89 * MIN, 'an hour ago', 'in an hour'],
  ['90min', 90 * MIN, '2 hours ago', 'in 2 hours'],
  ['21h', 21 * H, '21 hours ago', 'in 21 hours'],
  ['21h 29min', 21 * H + 29 * MIN, '21 hours ago', 'in 21 hours'],
  ['21h 30min', 21 * H + 30 * MIN, 'a day ago', 'in a day'],
  ['22h', 22 * H, 'a day ago', 'in a day'],
  ['35h', 35 * H, 'a day ago', 'in a day'],
  ['36h', 36 * H, '2 days ago', 'in 2 days'],
  ['25d', 25 * D, '25 days ago', 'in 25 days'],
  ['25d 11h', 25 * D + 11 * H, '25 days ago', 'in 25 days'],
  ['25d 12h', 25 * D + 12 * H, 'a month ago', 'in a month'],
  ['26d', 26 * D, 'a month ago', 'in a month'],
  ['45d', 45 * D, 'a month ago', 'in a month'],
  // Calendar months make the two directions differ: back from 15 Jan it is 1 month + 16 days, forward 1 month + 15 days.
  ['46d', 46 * D, '2 months ago', 'in a month'],
]

describe('fromNow', () => {
  it.each(boundaries)('%s: past and future', (_label, offset, past, future) => {
    expect(fromNow(at(-offset), NOW)).toBe(past)
    expect(fromNow(at(offset), NOW)).toBe(future)
  })

  // [label, months between 15 Jan 2025 and the later date, text]
  it.each([
    ['10mo', 10, '10 months'],
    ['11mo', 11, 'a year'],
    ['12mo', 12, 'a year'],
    ['17mo', 17, 'a year'],
    ['18mo', 18, '2 years'],
    ['24mo', 24, '2 years'],
    ['36mo', 36, '3 years'],
  ])('%s', (_label, months, text) => {
    const earlier = new Date(2025, 0, 15, 12)
    const later = new Date(2025, months, 15, 12)
    expect(fromNow(earlier, later)).toBe(`${text} ago`)
    expect(fromNow(later, earlier)).toBe(`in ${text}`)
  })

  it('accepts an ISO string (the API format)', () => {
    expect(fromNow(new Date(NOW.getTime() - 5 * MIN).toISOString(), NOW)).toBe('5 minutes ago')
  })

  it('uses the current time by default', () => {
    expect(fromNow(new Date(Date.now() - 3 * H))).toBe('3 hours ago')
  })
})
