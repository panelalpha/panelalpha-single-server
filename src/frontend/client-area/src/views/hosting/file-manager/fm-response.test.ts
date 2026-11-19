import { describe, expect, it } from 'vitest'
import { fmAlertPayload, fmErrorResult, fmResultText, parseFmBody } from './fm-response'

const translate = (key: string) => `T(${key})`

describe('parseFmBody', () => {
  it('maps the success codes of the backend to message keys', () => {
    expect(parseFmBody({ result: { status: 'success', message: 'uploaded' } })).toEqual({
      status: 'success',
      messageKey: 'message.fileManager.uploaded',
      message: null,
    })
    expect(parseFmBody({ result: { status: 'success', message: 'dirCreated' } }).messageKey).toBe('message.fileManager.dirCreated')
    expect(parseFmBody({ result: { status: 'warning', message: 'notAllUploaded' } })).toEqual({
      status: 'warning',
      messageKey: 'message.fileManager.notAllUploaded',
      message: null,
    })
  })

  it('passes a translated backend message through as text', () => {
    expect(parseFmBody({ result: { status: 'error', message: 'Cannot delete file.' } })).toEqual({
      status: 'error',
      messageKey: null,
      message: 'Cannot delete file.',
    })
  })

  it('treats a null message as no message (no alert)', () => {
    expect(parseFmBody({ result: { status: 'success', message: null } })).toEqual({
      status: 'success',
      messageKey: null,
      message: null,
    })
  })

  it('reads a body without result (preview answers { image }) as success', () => {
    expect(parseFmBody({ image: 'data:image/png;base64,AAA' })).toEqual({ status: 'success', messageKey: null, message: null })
  })

  it('maps the legacy danger status to error and an unknown status to error', () => {
    expect(parseFmBody({ result: { status: 'danger', message: 'x' } }).status).toBe('error')
    expect(parseFmBody({ result: { status: 'weird' } }).status).toBe('error')
  })

  it('does not map prototype names to keys', () => {
    expect(parseFmBody({ result: { status: 'error', message: 'constructor' } })).toEqual({
      status: 'error',
      messageKey: null,
      message: 'constructor',
    })
  })
})

describe('fmErrorResult', () => {
  it('uses the text of a 422 validation error', () => {
    const error = { response: { status: 422, data: { message: 'The name is invalid.' } } }
    expect(fmErrorResult(error)).toEqual({ status: 'error', messageKey: null, message: 'The name is invalid.' })
  })

  it('uses the generic text when the request never got an answer', () => {
    expect(fmErrorResult(new Error('Network Error')).message).toBe('Something went wrong. Please try again.')
  })
})

describe('fmResultText and fmAlertPayload', () => {
  it('translates a known code and passes the backend text through', () => {
    expect(fmResultText(parseFmBody({ result: { status: 'success', message: 'copied' } }), translate)).toBe('T(message.fileManager.copied)')
    expect(fmResultText(parseFmBody({ result: { status: 'error', message: 'Cannot delete file.' } }), translate)).toBe('Cannot delete file.')
    expect(fmResultText(parseFmBody({ result: { status: 'success' } }), translate)).toBeNull()
  })

  it('makes a success alert and an error alert, and no alert without text', () => {
    expect(fmAlertPayload(parseFmBody({ result: { status: 'success', message: 'copied' } }), translate)).toEqual({
      success: true,
      successMessage: 'T(message.fileManager.copied)',
    })
    expect(fmAlertPayload(parseFmBody({ result: { status: 'error', message: 'Nope.' } }), translate)).toEqual({
      success: false,
      errorMessage: 'Nope.',
    })
    expect(fmAlertPayload(parseFmBody({ result: { status: 'warning', message: 'notAllUploaded' } }), translate)).toEqual({
      success: false,
      errorMessage: 'T(message.fileManager.notAllUploaded)',
    })
    expect(fmAlertPayload(parseFmBody({ result: { status: 'success' } }), translate)).toBeNull()
  })
})
