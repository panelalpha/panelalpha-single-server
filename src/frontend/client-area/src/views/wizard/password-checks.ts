import { SETUP_PASSWORD_DIGIT_PATTERN, SETUP_PASSWORD_LOWER_PATTERN, SETUP_PASSWORD_SYMBOL_PATTERN, SETUP_PASSWORD_UPPER_PATTERN } from '@/shared/ui/form/use-form-rules'

// Rows of the strength hint under the password field. The admin area shows four rows with its own limit of
// 6 characters; next keeps the rules of `setupPasswordRules`, so the hint has five rows with the same expressions.

export const PASSWORD_MIN_LENGTH = 8

export type PasswordCheckKey = 'uppercase' | 'lowercase' | 'number' | 'symbol' | 'length'

export interface PasswordCheck {
  key: PasswordCheckKey
  passed: boolean
}

/** The five rows in the order of the hint: uppercase, lowercase, number, symbol, length. */
export function passwordChecks (password: string): PasswordCheck[] {
  return [
    { key: 'uppercase', passed: SETUP_PASSWORD_UPPER_PATTERN.test(password) },
    { key: 'lowercase', passed: SETUP_PASSWORD_LOWER_PATTERN.test(password) },
    { key: 'number', passed: SETUP_PASSWORD_DIGIT_PATTERN.test(password) },
    { key: 'symbol', passed: SETUP_PASSWORD_SYMBOL_PATTERN.test(password) },
    { key: 'length', passed: password.length >= PASSWORD_MIN_LENGTH },
  ]
}
