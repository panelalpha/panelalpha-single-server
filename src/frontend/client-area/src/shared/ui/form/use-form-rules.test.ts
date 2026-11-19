import i18next from 'i18next'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mountKit } from '@/test/mount-kit'
import { type FormRules, useFormRules } from './use-form-rules'

const labels = {
  email: 'Email', name: 'Name', siteName: 'Site name', domain: 'Domain',
  item: 'Item', password: 'Password', url: 'URL', username: 'Username',
}

async function rulesFromComponent (): Promise<FormRules> {
  let rules!: FormRules
  const Host = defineComponent({
    setup () {
      rules = useFormRules()
      return () => null
    },
  })
  const wrapper = await mountKit(Host)
  wrapper.unmount()
  return rules
}

/** First failing message of a rule array, or true. */
function run (rules: ((v: never) => true | string)[], value: unknown): true | string {
  for (const rule of rules) {
    const result = (rule as (v: unknown) => true | string)(value)
    if (result !== true) {
      return result
    }
  }
  return true
}

const req = (field: string) => `REQ ${field}`
const max = (field: string, length: number) => `MAX ${field} ${length}`
const min = (field: string, length: number) => `MIN ${field} ${length}`
const valid = (field: string) => `VALID ${field}`

describe('useFormRules', () => {
  let rules: FormRules

  beforeAll(async () => {
    const mount = await mountKit(defineComponent({ template: '<div />' }))
    mount.unmount()
    i18next.addResourceBundle('en', 'translation', {
      form: {
        label: labels,
        validation: {
          required: 'REQ {{field}}',
          maxLength: 'MAX {{field}} {{length}}',
          minLength: 'MIN {{field}} {{length}}',
          passwordCharacters: 'CLASSES {{field}}',
          passwordMismatch: 'MISMATCH',
          valid: 'VALID {{field}}',
        },
      },
      setup: {
        password: 'setup.password',
        validation: {
          required: 'REQ {{field}}',
          passwordMin: 'MINP',
          passwordLower: 'LOWER',
          passwordUpper: 'UPPER',
          passwordDigit: 'DIGIT',
          passwordSymbol: 'SYMBOL',
        },
      },
    }, true, true)
    rules = await rulesFromComponent()
  })

  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('exposes exactly the legacy rule sets', () => {
    expect(Object.keys(rules).toSorted()).toEqual([
      'adminPasswordRules', 'checkboxRules', 'domainRules', 'domainRulesTld', 'emailRules',
      'nameRules', 'passwordRules', 'policyPasswordRules', 'setupPasswordRules', 'siteNameRules', 'urlRules', 'usernameRules',
    ])
  })

  it('emailRules: required, then the email pattern', () => {
    expect(run(rules.emailRules, '')).toBe(req('Email'))
    expect(run(rules.emailRules, null)).toBe(req('Email'))
  })

  // Addresses the server's `email` rule accepts (RFCValidation): the client must not refuse them.
  it.each([
    'name@example.com',
    'name+tag@example.com',
    'user+tag+more@sub.domain.example.com',
    'john.doe-x@mail.example.com',
    'digit1+2@3.example.com',
    'a_b@example.com',
    'UPPER+Tag@Example.COM',
    'a@b',
    'a@localhost',
    'a@[127.0.0.1]',
    '"john doe"@example.com',
    'bücher@example.com',
    'a@bücher.example',
    'a!#$%&*/=?^`{|}~@example.com',
  ])('emailRules: accepts %s, as the server does', address => {
    expect(run(rules.emailRules, address)).toBe(true)
  })

  // Addresses the server refuses; the client keeps refusing them.
  it.each([
    'plain',
    '@b.com',
    'a@',
    'a..b@c',
    'a@b..c',
    '.a@b.com',
    'a.@b.com',
    'a@.b',
    'a@b.',
    'a@b@c.com',
    'a b@example.com',
    'a@b trailing garbage',
  ])('emailRules: refuses %s, as the server does', address => {
    expect(run(rules.emailRules, address)).toBe(valid('Email'))
  })

  it('emailRules: runs in linear time on a long local part without @', () => {
    // A backtracking pattern took exponential time here; the rule must stay linear.
    const started = performance.now()
    expect(run(rules.emailRules, `${'a'.repeat(5000)}!`)).toBe(valid('Email'))
    expect(performance.now() - started).toBeLessThan(100)
  })

  it('nameRules: max 10', () => {
    expect(run(rules.nameRules, '')).toBe(req('Name'))
    expect(run(rules.nameRules, 'a'.repeat(10))).toBe(true)
    expect(run(rules.nameRules, 'a'.repeat(11))).toBe(max('Name', 10))
  })

  it('siteNameRules: max 25', () => {
    expect(run(rules.siteNameRules, '')).toBe(req('Site name'))
    expect(run(rules.siteNameRules, 'a'.repeat(25))).toBe(true)
    expect(run(rules.siteNameRules, 'a'.repeat(26))).toBe(max('Site name', 25))
  })

  it('domainRules: max 255, min 4, charset', () => {
    expect(run(rules.domainRules, '')).toBe(req('Domain'))
    expect(run(rules.domainRules, 'a'.repeat(255))).toBe(true)
    expect(run(rules.domainRules, 'a'.repeat(256))).toBe(max('Domain', 255))
    expect(run(rules.domainRules, 'abc')).toBe(min('Domain', 4))
    expect(run(rules.domainRules, 'abcd')).toBe(true)
    expect(run(rules.domainRules, 'ab_d')).toBe(valid('Domain'))
    expect(run(rules.domainRules, 'a-b.c9')).toBe(true)
  })

  it('domainRulesTld: max 255, min 4, tld pattern', () => {
    expect(run(rules.domainRulesTld, '')).toBe(req('Domain'))
    expect(run(rules.domainRulesTld, `${'a'.repeat(250)}.com`.padEnd(256, 'm'))).toBe(max('Domain', 255))
    expect(run(rules.domainRulesTld, 'a.b')).toBe(min('Domain', 4))
    expect(run(rules.domainRulesTld, 'a.bc')).toBe(true)
    expect(run(rules.domainRulesTld, 'abcdefgh')).toBe(valid('Domain'))
    expect(run(rules.domainRulesTld, 'example.com')).toBe(true)
    expect(run(rules.domainRulesTld, 'sub.example.com:8080/path')).toBe(true)
    expect(run(rules.domainRulesTld, 'example.c')).toBe(valid('Domain'))
    expect(run(rules.domainRulesTld, 'example.abcdefghij')).toBe(valid('Domain'))
    expect(run(rules.domainRulesTld, 'example.abcdefghi')).toBe(true)
    expect(run(rules.domainRulesTld, 'example.com:123456')).toBe(valid('Domain'))
  })

  it('checkboxRules: truthy value required', () => {
    expect(run(rules.checkboxRules, false)).toBe(req('Item'))
    expect(run(rules.checkboxRules, undefined)).toBe(req('Item'))
    expect(run(rules.checkboxRules, true)).toBe(true)
  })

  it('adminPasswordRules: 6 to the policy maximum of 255', () => {
    expect(run(rules.adminPasswordRules, '')).toBe(req('Password'))
    expect(run(rules.adminPasswordRules, 'a'.repeat(5))).toBe(min('Password', 6))
    expect(run(rules.adminPasswordRules, 'a'.repeat(6))).toBe(true)
    expect(run(rules.adminPasswordRules, 'a'.repeat(30))).toBe(true)
    expect(run(rules.adminPasswordRules, 'a'.repeat(255))).toBe(true)
    expect(run(rules.adminPasswordRules, 'a'.repeat(256))).toBe(max('Password', 255))
  })

  it('policyPasswordRules: the panel user policy - required, 255 at most, 8 at least, both cases, a number and a symbol', () => {
    expect(run(rules.policyPasswordRules, '')).toBe(req('Password'))
    expect(run(rules.policyPasswordRules, 'a'.repeat(256))).toBe(max('Password', 255))
    expect(run(rules.policyPasswordRules, 'Abc1!ef')).toBe(min('Password', 8))
    expect(run(rules.policyPasswordRules, 'abcdefg1!')).toBe('CLASSES Password')
    expect(run(rules.policyPasswordRules, 'ABCDEFG1!')).toBe('CLASSES Password')
    expect(run(rules.policyPasswordRules, 'Abcdefgh!')).toBe('CLASSES Password')
    expect(run(rules.policyPasswordRules, 'Abcdefgh1')).toBe('CLASSES Password')
    expect(run(rules.policyPasswordRules, 'Abcdefg1!')).toBe(true)
    expect(run(rules.policyPasswordRules, 'A'.repeat(252) + 'b1!')).toBe(true)
  })

  it('policyPasswordRules: letters and digits are Unicode, as the backend Password rule', () => {
    // Accepted by the backend (\p{Lu}, \p{Ll}, digit, symbol), so accepted here.
    expect(run(rules.policyPasswordRules, 'ПАРОЛЬпароль1!')).toBe(true)
    // Rejected by the backend: `é` is a letter, not a symbol.
    expect(run(rules.policyPasswordRules, 'Passwordé1')).toBe('CLASSES Password')
  })

  it('setupPasswordRules: stays ASCII as before, unlike policyPasswordRules', () => {
    // Same result as on develop: `é` counts as a symbol, Cyrillic letters are not a-z / A-Z.
    expect(run(rules.setupPasswordRules, 'Passwordé1')).toBe(true)
    expect(run(rules.setupPasswordRules, 'ПАРОЛЬпароль1!')).toBe('LOWER')
    expect(run(rules.setupPasswordRules, 'Password1')).toBe('SYMBOL')
    // The other fields keep the Unicode rules.
    expect(run(rules.policyPasswordRules, 'Passwordé1')).toBe('CLASSES Password')
    expect(run(rules.policyPasswordRules, 'ПАРОЛЬпароль1!')).toBe(true)
  })

  it('setupPasswordRules: required, min 8, lower, upper, digit, symbol, in this order', () => {
    expect(run(rules.setupPasswordRules, '')).toBe('REQ setup.password')
    expect(run(rules.setupPasswordRules, null)).toBe('REQ setup.password')
    expect(run(rules.setupPasswordRules, 'Aa1!aa')).toBe('MINP')
    expect(run(rules.setupPasswordRules, 'AAAA1!AA')).toBe('LOWER')
    expect(run(rules.setupPasswordRules, 'aaaa1!aa')).toBe('UPPER')
    expect(run(rules.setupPasswordRules, 'Aaaaa!aa')).toBe('DIGIT')
    expect(run(rules.setupPasswordRules, 'Aaaaa1aa')).toBe('SYMBOL')
    expect(run(rules.setupPasswordRules, 'Aaaa1!aa')).toBe(true)
    // the first failing rule wins: a short value without a digit reports the length
    expect(run(rules.setupPasswordRules, 'abc')).toBe('MINP')
  })

  it('setupPasswordRules: each rule on its own', () => {
    const [required, min8, lower, upper, digit, symbol] = rules.setupPasswordRules as ((v: unknown) => true | string)[]
    expect(required!('')).toBe('REQ setup.password')
    expect(required!('x')).toBe(true)
    expect(min8!('1234567')).toBe('MINP')
    expect(min8!('12345678')).toBe(true)
    expect(lower!('ABC')).toBe('LOWER')
    expect(lower!('aBC')).toBe(true)
    expect(upper!('abc')).toBe('UPPER')
    expect(upper!('aBc')).toBe(true)
    expect(digit!('abc')).toBe('DIGIT')
    expect(digit!('a1c')).toBe(true)
    expect(symbol!('abc123')).toBe('SYMBOL')
    expect(symbol!('abc 123')).toBe(true)
    expect(symbol!('abc_123')).toBe(true)
    // `test` coerces like legacy: undefined is tested as the string "undefined"
    expect(lower!(undefined)).toBe(true)
    expect(upper!(undefined)).toBe('UPPER')
  })

  it('urlRules, usernameRules and passwordRules only require a value', () => {
    expect(run(rules.urlRules, '')).toBe(req('URL'))
    expect(run(rules.urlRules, 'x')).toBe(true)
    expect(run(rules.usernameRules, '')).toBe(req('Username'))
    expect(run(rules.usernameRules, 'x')).toBe(true)
    expect(run(rules.passwordRules, '')).toBe(req('Password'))
    expect(run(rules.passwordRules, 'x')).toBe(true)
  })

  it('translates at validation time, so a language change applies to existing rules', async () => {
    i18next.addResourceBundle('pl', 'translation', {
      form: {
        label: { email: 'E-mail' },
        validation: { required: 'WYMAGANE {{field}}' },
      },
    }, true, true)
    expect(run(rules.emailRules, '')).toBe(req('Email'))
    await i18next.changeLanguage('pl')
    expect(run(rules.emailRules, '')).toBe('WYMAGANE E-mail')
  })
})
