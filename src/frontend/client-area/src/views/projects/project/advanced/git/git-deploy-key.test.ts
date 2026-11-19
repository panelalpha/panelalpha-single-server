import { describe, expect, it } from 'vitest'
import { buildDeleteKeyModal, buildRotateKeyModal, deployKeyErrorMessage } from './git-deploy-key'

const t = (key: string) => key

describe('buildDeleteKeyModal', () => {
  it('is the red warning dialog with the delete button and the cancel button', () => {
    const modal = buildDeleteKeyModal(t)

    expect(modal.type).toBe('git-deploy-key-delete')
    expect(modal.props.title).toBe('heading.onboarding.gitDeploy.auth.deployKey.deleteTitle')
    expect(modal.props.message).toBe('heading.onboarding.gitDeploy.auth.deployKey.deleteWarning')
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('error')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.onboarding.gitDeploy.deleteDeployKey', color: 'error' })
    expect(modal.fields).toEqual([])
    expect(modal.persistent).toBe(false)
  })
})

describe('buildRotateKeyModal', () => {
  it('is the red warning dialog that generates a new key on confirm', () => {
    const modal = buildRotateKeyModal(t)

    expect(modal.type).toBe('git-deploy-key-rotate')
    expect(modal.props.title).toBe('heading.onboarding.gitDeploy.auth.deployKey.regenerateTitle')
    expect(modal.props.message).toBe('heading.onboarding.gitDeploy.auth.deployKey.regenerateWarning')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.onboarding.gitDeploy.regenerateDeployKey', color: 'error' })
  })
})

describe('deployKeyErrorMessage', () => {
  const general = (error: unknown) => `general:${(error as Error).message}`

  it('takes the first repo_url message of the response', () => {
    const error = { response: { data: { errors: { repo_url: ['The repository address is invalid.', 'Second.'] } } } }

    expect(deployKeyErrorMessage(error, general)).toBe('The repository address is invalid.')
  })

  it('falls back to the general message when there is no repo_url message', () => {
    const error = Object.assign(new Error('boom'), { response: { data: { errors: { other: ['x'] } } } })

    expect(deployKeyErrorMessage(error, general)).toBe('general:boom')
  })

  it('falls back to the general message for a plain error', () => {
    expect(deployKeyErrorMessage(new Error('plain'), general)).toBe('general:plain')
  })
})
