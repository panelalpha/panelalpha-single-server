const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SPECIAL = '!@#$%^&*()'

/** Returns a number in [0, 1), like `Math.random`; injectable so tests are deterministic. */
export type RandomSource = () => number

/** CSPRNG in [0, 1); legacy used `Math.random`. */
export const cryptoRandom: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32

function randomString (chars: string, length: number, random: RandomSource): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random() * chars.length)
    result += chars.slice(index, index + 1)
  }
  return result
}

/**
 * At least one lowercase letter, uppercase letter, digit and `!@#$%^&*()` symbol
 * (so never shorter than 4), then shuffled with Fisher-Yates.
 */
export function generatePassword (length = 10, random: RandomSource = cryptoRandom): string {
  const requiredSets = [LOWERCASE, UPPERCASE, DIGITS, SPECIAL]
  const allChars = LOWERCASE + UPPERCASE + DIGITS + SPECIAL
  const safeLength = Math.max(length, requiredSets.length)

  let password = requiredSets.map(chars => randomString(chars, 1, random)).join('')

  const remainingLength = safeLength - requiredSets.length
  if (remainingLength > 0) {
    password += randomString(allChars, remainingLength, random)
  }

  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = chars[i]!
    chars[i] = chars[j]!
    chars[j] = tmp
  }
  return chars.join('')
}
