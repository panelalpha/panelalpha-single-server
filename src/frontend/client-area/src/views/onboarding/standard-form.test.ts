import type { OnboardingService } from './onboarding-service'
import { describe, expect, it } from 'vitest'
import {
  asksForWordpressVersion,
  createStandardForm,
  forcesTemplate,
  generateStandardFormPassword,
  hasAdvancedFields,
  installTypeForTab,
  prefilledLoaderFields,
  prefillFromInstallDetails,
  selectInstallType,
  setLoaderDefault,
  STANDARD_LANGUAGES,
  standardFieldsOf,
  tabForInstallType,
} from './standard-form'

function service (patch: Record<string, unknown> = {}): OnboardingService {
  return { id: 10, status: 'active', ...patch } as unknown as OnboardingService
}

describe('createStandardForm', () => {
  it('starts as an advanced install with the legacy defaults', () => {
    const form = createStandardForm('owner@shop.pl', 'Abcdef1234')
    expect(form).toMatchObject({
      install_method: 'advanced',
      install_type: 'clean',
      name: '',
      domain: '',
      domainProtocol: 'https://',
      protocol: 'https://',
      language: 'en',
      admin_username: 'admin',
      admin_email: 'owner@shop.pl',
      admin_password: 'Abcdef1234',
    })
  })

  it('starts the selects that have no value as null, not an empty string', () => {
    const form = createStandardForm('', '')
    expect(form.version).toBeNull()
    expect(form.clone_instance_id).toBeNull()
    expect(form.instance_template_id).toBeNull()
  })
})

describe('generateStandardFormPassword', () => {
  it('is 10 characters of letters and digits', () => {
    const password = generateStandardFormPassword()
    expect(password).toHaveLength(10)
    expect(password).toMatch(/^[\da-z]{10}$/i)
  })

  it('takes the characters from the random source (deterministic with a fixed source)', () => {
    expect(generateStandardFormPassword(() => 0)).toBe('0000000000')
    // The alphabet has 62 characters; 0.999 picks the last one, `Z`.
    expect(generateStandardFormPassword(() => 0.999)).toBe('ZZZZZZZZZZ')
  })
})

describe('install type tabs', () => {
  it('maps the tab index to the install type (clean 0, clone 1, template 2)', () => {
    expect(installTypeForTab(0)).toBe('clean')
    expect(installTypeForTab(1)).toBe('clone')
    expect(installTypeForTab(2)).toBe('template')
  })

  it('maps the install type back to the tab index, and an unknown type to clean', () => {
    expect(tabForInstallType('clean')).toBe(0)
    expect(tabForInstallType('clone')).toBe(1)
    expect(tabForInstallType('template')).toBe(2)
    expect(tabForInstallType(undefined)).toBe(0)
    expect(tabForInstallType('other')).toBe(0)
  })

  it('a clone picked with no instance takes the first instance of the list', () => {
    const form = createStandardForm('', '')
    selectInstallType(form, 'clone', [{ id: 7 }, { id: 8 }])
    expect(form.install_type).toBe('clone')
    expect(form.clone_instance_id).toBe(7)
  })

  it('a clone picked with an instance already chosen keeps it', () => {
    const form = createStandardForm('', '')
    form.clone_instance_id = 8
    selectInstallType(form, 'clone', [{ id: 7 }, { id: 8 }])
    expect(form.clone_instance_id).toBe(8)
  })

  it('a clone with no instances keeps the choice empty', () => {
    const form = createStandardForm('', '')
    selectInstallType(form, 'clone', [])
    expect(form.clone_instance_id).toBeNull()
  })
})

describe('service flags of the form', () => {
  it('opens the advanced tab only when a standard field is true', () => {
    expect(hasAdvancedFields({ language: true, database_name: false })).toBe(true)
    expect(hasAdvancedFields({ language: false })).toBe(false)
    expect(hasAdvancedFields(undefined)).toBe(false)
  })

  it('reads the standard fields on the service, with the onboarding block as the fallback', () => {
    expect(standardFieldsOf(service({ standard_fields: { language: true } }))).toEqual({ language: true })
    expect(standardFieldsOf(service({ onboarding: { standard_fields: { language: true } } }))).toEqual({ language: true })
    expect(standardFieldsOf(null)).toBeUndefined()
  })

  it('hides the type tabs for a forced template, and locks the version unless the service asks for it', () => {
    expect(forcesTemplate(service({ standard_force_template: true }))).toBe(true)
    expect(forcesTemplate(service({ onboarding: { standard_force_template: true } }))).toBe(true)
    expect(forcesTemplate(service())).toBe(false)

    expect(asksForWordpressVersion(service({ ask_for_wordpress_version: true }))).toBe(true)
    expect(asksForWordpressVersion(service())).toBe(false)
  })
})

describe('STANDARD_LANGUAGES', () => {
  it('lists the 37 legacy languages in legacy order', () => {
    expect(STANDARD_LANGUAGES).toHaveLength(37)
    expect(STANDARD_LANGUAGES[0]).toBe('en')
    expect(STANDARD_LANGUAGES.at(-1)).toBe('zh_HK')
  })
})

describe('prefillFromInstallDetails (Try again with the form)', () => {
  it('copies the form keys of install_details and sets the tab of the install type', () => {
    const prefill = prefillFromInstallDetails({
      install_method: 'standard',
      install_type: 'template',
      name: 'shop',
      domain: 'shop.pl',
      dir: '/blog',
      language: 'pl_PL',
      instance_template_id: 4,
      unknown_key: 'ignored',
    })

    expect(prefill.values).toMatchObject({ install_type: 'template', name: 'shop', domain: 'shop.pl', dir: '/blog', language: 'pl_PL', instance_template_id: 4 })
    expect(prefill.values).not.toHaveProperty('unknown_key')
    expect(prefill.values).not.toHaveProperty('install_method')
    expect(prefill.tab).toBe(2)
    expect(prefill.subdirectoryOpen).toBe(true)
    expect(prefill.installMethod).toBe('standard')
  })

  it('maps clean and clone to tabs 0 and 1, and leaves the tab alone for an unknown type', () => {
    expect(prefillFromInstallDetails({ install_type: 'clean' }).tab).toBe(0)
    expect(prefillFromInstallDetails({ install_type: 'clone' }).tab).toBe(1)
    expect(prefillFromInstallDetails({ install_type: 'other' }).tab).toBeNull()
  })

  it('keeps the advanced method for the retry request and opens no directory panel without a dir', () => {
    const prefill = prefillFromInstallDetails({ install_method: 'advanced', install_type: 'clean' })
    expect(prefill.installMethod).toBe('advanced')
    expect(prefill.subdirectoryOpen).toBe(false)
  })

  it('reads a missing or non-object install_details as an empty prefill', () => {
    expect(prefillFromInstallDetails(null)).toMatchObject({ values: {}, tab: null, subdirectoryOpen: false, installMethod: null })
  })
})

describe('prefilledLoaderFields', () => {
  it('names the loader fields that the prefill sets to a real value', () => {
    expect(prefilledLoaderFields({ version: '6.5', clone_instance_id: 9, instance_template_id: 4 })).toEqual([
      'version',
      'clone_instance_id',
      'instance_template_id',
    ])
  })

  it('leaves the loader default in place for an empty, null or missing value', () => {
    expect(prefilledLoaderFields({ version: null, clone_instance_id: '', name: 'shop' })).toEqual([])
    expect(prefilledLoaderFields({})).toEqual([])
  })
})

describe('setLoaderDefault', () => {
  it('sets the first list entry when no prefill holds the field', () => {
    const form = createStandardForm('', '')
    setLoaderDefault(form, 'version', '6.5', [])
    expect(form.version).toBe('6.5')
  })

  it('does not overwrite a field the Try again prefill set (the loader answers after the prefill)', () => {
    const form = createStandardForm('', '')
    form.version = '6.4'
    form.instance_template_id = 4
    setLoaderDefault(form, 'version', '6.5', ['version'])
    setLoaderDefault(form, 'instance_template_id', 9, ['version'])
    expect(form.version).toBe('6.4')
    expect(form.instance_template_id).toBe(9)
  })
})
