import { describe, expect, it } from 'vitest'
import { buttonState, type ModalButton } from './basic-modal-buttons'

const submit: ModalButton = { id: 'submit', label: 'Save', color: 'primary', loading: true }
const other: ModalButton = { id: 'other', label: 'Other', color: 'error' }
const cancel: ModalButton = { id: 'cancel', label: 'Cancel', color: 'normal', type: 'cancel' }

describe('buttonState', () => {
  it('is idle without submitting or loading', () => {
    expect(buttonState(submit, {})).toEqual({ loading: false, disabled: false })
    expect(buttonState(cancel, {})).toEqual({ loading: false, disabled: false })
  })

  describe('default loading mode', () => {
    it('spins every non-cancel button while submitting', () => {
      expect(buttonState(submit, { submitting: true }).loading).toBe(true)
      expect(buttonState(other, { submitting: true }).loading).toBe(true)
      expect(buttonState(cancel, { submitting: true }).loading).toBe(false)
    })

    it('spins every non-cancel button while the modal is loading', () => {
      expect(buttonState(other, { loading: true }).loading).toBe(true)
      expect(buttonState(cancel, { loading: true }).loading).toBe(false)
    })

    it('does not disable other buttons while submitting', () => {
      expect(buttonState(other, { submitting: true }).disabled).toBe(false)
    })
  })

  describe('active loading mode', () => {
    it('spins only the button with loading while submitting', () => {
      const context = { submitting: true, loadingMode: 'active' }
      expect(buttonState(submit, context).loading).toBe(true)
      expect(buttonState(other, context).loading).toBe(false)
      expect(buttonState(cancel, context).loading).toBe(false)
    })

    it('ignores the modal loading flag', () => {
      expect(buttonState(submit, { loading: true, loadingMode: 'active' }).loading).toBe(false)
    })

    it('disables the buttons that do not spin while submitting', () => {
      const context = { submitting: true, loadingMode: 'active' }
      expect(buttonState(submit, context).disabled).toBe(false)
      expect(buttonState(other, context).disabled).toBe(true)
      expect(buttonState(cancel, context).disabled).toBe(true)
      expect(buttonState(other, { loadingMode: 'active' }).disabled).toBe(false)
    })
  })

  it('honours the button own disabled flag', () => {
    expect(buttonState({ ...submit, disabled: true }, {}).disabled).toBe(true)
    expect(buttonState({ ...cancel, disabled: true }, {}).disabled).toBe(true)
  })

  it('gates non-cancel buttons on confirmed when confirmRequired', () => {
    // hasRequiredCheckboxes && type !== 'cancel' && !formValues.confirm
    expect(buttonState(submit, { confirmRequired: true }).disabled).toBe(true)
    expect(buttonState(submit, { confirmRequired: true, confirmed: false }).disabled).toBe(true)
    expect(buttonState(submit, { confirmRequired: true, confirmed: true }).disabled).toBe(false)
    expect(buttonState(cancel, { confirmRequired: true }).disabled).toBe(false)
    expect(buttonState(submit, { confirmed: false }).disabled).toBe(false)
  })
})
