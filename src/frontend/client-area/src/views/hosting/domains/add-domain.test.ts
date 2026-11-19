import { describe, expect, it } from 'vitest'
import {
  addDomainButtons,
  addDomainFields,
  addDomainPayload,
  addedDomainTypeLabel,
  canOpenAddDomain,
  domainInputsHiddenAfterTypeChange,
  initialAddDomainValues,
  initialDomainInputsHidden,
  isRefusedDomainAdd,
  parentDomains,
  showsAddDomainDnsOptions,
} from './add-domain'

const t = (key: string, options?: Record<string, unknown>): string => options ? `${key}:${JSON.stringify(options)}` : key

type Rule = (value: unknown) => true | string

function rulesOf (index: number, hidden = initialDomainInputsHidden('addon')): Rule[] {
  const field = addDomainFields(['addon', 'sub'], ['example.com'], hidden, t)[index]!
  return (field as { rules: Rule[] }).rules
}

describe('hidden flags', () => {
  it('starts with the subdomain input hidden whatever the type (legacy compares with "subdomain")', () => {
    expect(initialDomainInputsHidden('addon')).toEqual({ alias: true, target: true, sub: true, addon: false })
    expect(initialDomainInputsHidden('sub')).toEqual({ alias: true, target: true, sub: true, addon: true })
    expect(initialDomainInputsHidden('alias')).toEqual({ alias: false, target: false, sub: true, addon: true })
  })

  it('flips the three inputs on a type change but never the alias target', () => {
    const start = initialDomainInputsHidden('addon')
    expect(domainInputsHiddenAfterTypeChange('sub', start)).toEqual({ alias: true, target: true, sub: false, addon: true })
    expect(domainInputsHiddenAfterTypeChange('alias', start)).toEqual({ alias: false, target: true, sub: true, addon: true })
    expect(domainInputsHiddenAfterTypeChange('addon', { alias: false, target: true, sub: false, addon: true })).toEqual({ alias: true, target: true, sub: true, addon: false })
  })

  it('leaves the flags of a type it does not know', () => {
    const start = initialDomainInputsHidden('addon')
    expect(domainInputsHiddenAfterTypeChange('main', start)).toBe(start)
  })
})

describe('opening', () => {
  it('needs a type and a parent domain', () => {
    expect(canOpenAddDomain(['addon'], ['a.com'])).toBe(true)
    expect(canOpenAddDomain([], ['a.com'])).toBe(false)
    expect(canOpenAddDomain(['addon'], [])).toBe(false)
  })

  it('offers every domain but a sub or an alias as a parent', () => {
    expect(parentDomains([
      { domain: 'a.com', type: 'main' },
      { domain: 'b.com', type: 'addon' },
      { domain: 'c.a.com', type: 'sub' },
      { domain: 'd.com', type: 'alias' },
    ])).toEqual(['a.com', 'b.com'])
  })

  it('starts from the first type and the first parent', () => {
    expect(initialAddDomainValues(['addon', 'sub'], ['a.com', 'b.com'])).toEqual({ type: 'addon', parent_domain: 'a.com', target_domain: 'a.com', domain: null })
  })
})

describe('fields', () => {
  it('lists alias, alias target, subdomain, addon and type in legacy order', () => {
    const fields = addDomainFields(['addon', 'sub'], ['a.com'], initialDomainInputsHidden('addon'), t)
    expect(fields.map(field => field.type)).toEqual(['text', 'select', 'text-select', 'domain-input', 'select'])
    expect(fields.map(field => field.hidden)).toEqual([true, true, true, false, undefined])
  })

  it('translates the types with form.option.*', () => {
    const type = addDomainFields(['addon', 'sub'], ['a.com'], initialDomainInputsHidden('addon'), t)[4]!
    expect((type as { options: unknown[] }).options).toEqual([
      { label: 'form.option.addon', value: 'addon' },
      { label: 'form.option.sub', value: 'sub' },
    ])
  })

  it('rejects www. for an addon and a subdomain but not for an alias', () => {
    const noWww = (rules: Rule[]) => rules.every(rule => rule('www.example.org') === true)
    expect(noWww(rulesOf(0))).toBe(true)
    expect(noWww(rulesOf(2))).toBe(false)
    expect(noWww(rulesOf(3))).toBe(false)
  })

  it('requires the domain and checks its pattern', () => {
    const rules = rulesOf(3)
    expect(rules[0]!('')).toContain('form.validation.required')
    expect(rules.map(rule => rule('bad domain!'))).toContainEqual(expect.stringContaining('form.validation.valid'))
    expect(rules.every(rule => rule('good-domain_1.org') === true)).toBe(true)
  })

  it('caps the domain at 255 characters', () => {
    const long = `${'a'.repeat(260)}.org`
    expect(rulesOf(0).map(rule => rule(long))).toContainEqual(expect.stringContaining('form.validation.maxLength'))
  })

  it('has the add button before cancel', () => {
    expect(addDomainButtons(t).map(button => button.id)).toEqual(['submit', 'cancel'])
  })
})

describe('payload', () => {
  const values = { type: 'sub', domain: 'blog', parent_domain: 'example.com', target_domain: 'example.com' }

  it('appends the parent to a subdomain and sends the whole form', () => {
    expect(addDomainPayload(values)).toEqual({ type: 'sub', domain: 'blog.example.com', parent_domain: 'example.com', target_domain: 'example.com' })
  })

  it('sends an addon as typed', () => {
    expect(addDomainPayload({ ...values, type: 'addon', domain: 'new.org' }).domain).toBe('new.org')
  })

  it('names the type for the success message', () => {
    expect(addedDomainTypeLabel('sub', t)).toBe('form.label.subdomain')
    expect(addedDomainTypeLabel('addon', t)).toBe('form.label.domain')
  })
})

describe('live DnsOptions', () => {
  it('shows for an addon being added and always for the instructions step', () => {
    expect(showsAddDomainDnsOptions('add-domain', 'addon')).toBe(true)
    expect(showsAddDomainDnsOptions('add-domain', 'sub')).toBe(false)
    expect(showsAddDomainDnsOptions('dns-instructions', undefined)).toBe(true)
    expect(showsAddDomainDnsOptions('other', 'addon')).toBe(false)
  })
})

/** An axios refusal as the panel answers it (`POST /server-accounts/{id}/domains`). */
function refusal (status: number, data: Record<string, unknown>): unknown {
  return { isAxiosError: true, response: { status, data } }
}

describe('a refused add', () => {
  it('takes a 422 answer as the domain field\'s own message', () => {
    expect(isRefusedDomainAdd(refusal(422, { message: 'The domain field format is invalid.', errors: { domain: ['The domain field format is invalid.'] } }))).toBe(true)
    expect(isRefusedDomainAdd(refusal(422, { message: 'Invalid domain name.' }))).toBe(true)
  })

  it('leaves the field alone for anything but a refused answer', () => {
    expect(isRefusedDomainAdd(new Error('network'))).toBe(false)
    expect(isRefusedDomainAdd(refusal(500, { message: 'Server Error' }))).toBe(false)
    expect(isRefusedDomainAdd(undefined)).toBe(false)
  })

  it('shows the message in the domain input field', () => {
    const field = addDomainFields(['addon', 'sub'], ['a.com'], initialDomainInputsHidden('addon'), t, ['The domain field format is invalid.'])[3]
    expect(field).toMatchObject({ type: 'domain-input', errorMessages: ['The domain field format is invalid.'] })
    expect(addDomainFields(['addon', 'sub'], ['a.com'], initialDomainInputsHidden('addon'), t)[3]).toMatchObject({ errorMessages: [] })
  })
})
