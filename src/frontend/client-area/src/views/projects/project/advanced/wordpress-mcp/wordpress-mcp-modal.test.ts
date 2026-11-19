import { describe, expect, it } from 'vitest'
import { MODAL_WIDTH } from '@/shared/ui/modal/action-modal'
import { buildDisableMcpModal } from './wordpress-mcp-modal'

const t = (key: string) => key

describe('buildDisableMcpModal', () => {
  const modal = buildDisableMcpModal(t)

  it('is the wordpress-mcp-disable dialog', () => {
    expect(modal.type).toBe('wordpress-mcp-disable')
  })

  it('takes the title and the body of the disable confirmation', () => {
    expect(modal.props.title).toBe('heading.instance.advanced.wordpressMcp.disableConfirmTitle')
    expect(modal.props.message).toBe('heading.instance.advanced.wordpressMcp.disableConfirmBody')
  })

  it('uses the warning icon and the warning colour', () => {
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('warning')
  })

  it('shows the confirm button first and the cancel button second, both warning-coloured for confirm', () => {
    const [confirm, cancel] = modal.props.buttons
    expect(modal.props.buttons).toHaveLength(2)
    expect(confirm).toMatchObject({ id: 'submit', label: 'heading.instance.advanced.wordpressMcp.confirm', color: 'warning' })
    expect(cancel).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
  })

  it('has no fields, no confirm checkbox and is persistent at the standard width', () => {
    expect(modal.fields).toEqual([])
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.persistent).toBe(true)
    expect(modal.width).toBe(MODAL_WIDTH)
  })
})
