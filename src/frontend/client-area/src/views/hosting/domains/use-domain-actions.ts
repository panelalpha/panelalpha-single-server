import type { DomainVerification } from '@/views/hosting/hosting.api'
import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
import type { AddDomainValues, DomainInputsHidden, Translate } from './add-domain'
import type { HostingDomain } from './domains.types'
import type { EditDomainFieldErrors } from './row-actions'
import type { TransferDnsRecord } from './transfer-domain'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { computed, getCurrentScope, onScopeDispose, reactive, ref, watch } from 'vue'
import { hasDomainDnsInstructions } from '@/entities/domain/ui/dns-options'
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
import {
  deleteDomainButtons,
  deleteDomainFields,
  editDomainButtons,
  editDomainFields,
  editDomainRefusal,
  editDomainTitle,
  editDomainValues,
  normalizeRedirectUrl,
  setPrimaryButtons,
  setPrimaryMessage,
  updatePayload,
} from './row-actions'

// The dialog state of the Domains actions. One `v-dialog` holds every action; a step of it (Add, then the DNS instructions) replaces what
// the dialog shows.

export type DomainModalMode = 'add-domain' | 'dns-instructions' | 'edit-domain' | 'delete-domain' | 'set-primary'

export interface DomainModalState {
  mode: DomainModalMode
  title: string
  icon: string
  buttons: ModalButton[]
  /** Add only: the domain types of the account and the domains a subdomain or alias can hang on, as they were when the dialog opened. */
  types: string[]
  parents: string[]
  /** The item of the dns-instructions step. */
  item: { domain: string, type: string } | null
  /** Edit, Delete and Set as primary: the row the dialog acts on. */
  row: HostingDomain | null
  /** The icon colour of Delete. */
  color?: string
  /** The message, rendered as `v-html`. */
  message?: string
  /** The dialog's own account of a refused request: it stays under the message until the next submit or close. */
  alert?: string
  /** Delete: a required checkbox gates the submit button. */
  confirmRequired: boolean
}

export interface DomainActionsDeps {
  service: () => HostingService
  account: () => HostingServerAccount | null
  rows: () => ReadonlyArray<{ domain: string, type: string }>
  supportedDomainTypes: () => string[]
  reload: (sortByNewest?: boolean) => Promise<void>
  highlight: (domain: string) => void
  addDomain: (accountId: number, body: Record<string, unknown>) => Promise<void>
  updateDomain: (accountId: number, domain: string, body: Record<string, unknown>) => Promise<void>
  deleteDomain: (accountId: number, domain: string) => Promise<void>
  setPrimaryDomain: (accountId: number, domain: string) => Promise<void>
  /** The project page's resource: a new main domain changes the address it shows. Best effort, it reports nothing. */
  refreshInstance?: () => void
  verifyDomain: (serviceId: number, domain: string) => Promise<DomainVerification>
  resetCertificateCache: (accountId: number) => void
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
  t: Translate
}

export type ValidateForm = () => Promise<{ valid: boolean }>

export function useDomainActions (deps: DomainActionsDeps) {
  const open = ref(false)
  const persistent = ref(false)
  const submitting = ref(false)
  // Every open re-creates the `BasicModal`, so its field state starts again.
  const render = ref(0)
  const modal = ref<DomainModalState | null>(null)
  const values = reactive<Record<string, unknown>>({})
  // The message a refused Add puts under the domain field (`errors.domain` of the 422); the user's next edit clears it.
  const domainFieldErrors = ref<string[]>([])
  const editFieldErrors = ref<EditDomainFieldErrors>({})
  const hidden = ref<DomainInputsHidden>(initialDomainInputsHidden(''))
  // The transfer dialog is separate from the action dialog.
  const transfer = reactive<{ open: boolean, domain: AddDomainValues, record: TransferDnsRecord | null }>({
    open: false,
    domain: { type: '', domain: null, parent_domain: null, target_domain: null },
    record: null,
  })

  const fields = computed<ModalField[]>(() => {
    const current = modal.value
    if (current?.mode === 'edit-domain' && current.row) {
      return editDomainFields(current.row, deps.t, Boolean(values.redirect_enabled), editFieldErrors.value)
    }
    if (current?.mode === 'delete-domain') {
      return deleteDomainFields(deps.t)
    }
    if (current?.mode !== 'add-domain') {
      return []
    }
    return addDomainFields(current.types, current.parents, hidden.value, deps.t, domainFieldErrors.value)
  })

  /** The DNS options for the dialog as it is now. */
  const showDnsOptions = computed(() => {
    const current = modal.value
    return Boolean(current && deps.account() && showsAddDomainDnsOptions(current.mode, (values.type as string | undefined) ?? current.item?.type))
  })

  /** The typed domain while adding, the added one in the dns-instructions step. */
  const dnsOptionsDomain = computed(() => {
    const current = modal.value
    return current?.mode === 'dns-instructions' ? (current.item?.domain ?? '') : ((values.domain as string | null) || '')
  })

  function resetValues (next: Record<string, unknown>): void {
    for (const key of Object.keys(values)) {
      delete values[key]
    }
    Object.assign(values, next)
    domainFieldErrors.value = []
    editFieldErrors.value = {}
  }

  watch(() => values.domain, () => {
    domainFieldErrors.value = []
  })

  /** Drops the message a refusal put under `name`, so the user's edit reports through the field's own rules again. */
  function clearEditFieldError (name: keyof EditDomainFieldErrors): void {
    if (editFieldErrors.value[name]?.length) {
      editFieldErrors.value = { ...editFieldErrors.value, [name]: [] }
    }
  }

  watch(() => values.document_root, () => clearEditFieldError('document_root'))
  watch(() => values.redirect_url, () => clearEditFieldError('redirect_url'))
  watch(() => values.redirect_enabled, () => clearEditFieldError('redirect_url'))

  function openAdd (): void {
    const types = deps.supportedDomainTypes()
    const parents = parentDomains(deps.rows())
    if (!canOpenAddDomain(types, parents)) {
      return
    }
    render.value++
    const initial = initialAddDomainValues(types, parents)
    resetValues({ ...initial })
    hidden.value = initialDomainInputsHidden(initial.type)
    modal.value = {
      mode: 'add-domain',
      title: deps.t('heading.hosting.domains.modal.create.title'),
      icon: '$plus',
      buttons: addDomainButtons(deps.t),
      types,
      parents,
      item: null,
      row: null,
      confirmRequired: false,
    }
    open.value = true
  }

  /** The same dialog, its content replaced. */
  function showDnsInstructions (domain: string): void {
    modal.value = {
      mode: 'dns-instructions',
      title: deps.t('heading.instance.modal.setDomain.title'),
      icon: '',
      buttons: [{ id: 'close', label: deps.t('button.close'), color: 'primary' }],
      types: [],
      parents: [],
      item: { domain, type: 'addon' },
      row: null,
      confirmRequired: false,
    }
    resetValues({})
    submitting.value = false
    open.value = true
  }

  /** The shared part of the row dialogs. */
  function openRow (row: HostingDomain, state: Pick<DomainModalState, 'mode' | 'title' | 'icon' | 'buttons'> & Partial<DomainModalState>, initial: Record<string, unknown>): void {
    render.value++
    resetValues(initial)
    modal.value = { types: [], parents: [], item: { domain: row.domain, type: row.type }, row, confirmRequired: false, ...state }
    open.value = true
  }

  function openEdit (row: HostingDomain): void {
    openRow(row, {
      mode: 'edit-domain',
      title: editDomainTitle(row.domain, deps.t),
      icon: '$edit',
      buttons: editDomainButtons(deps.t),
    }, editDomainValues(row))
  }

  function openDelete (row: HostingDomain): void {
    openRow(row, {
      mode: 'delete-domain',
      title: deps.t('heading.hosting.domains.modal.delete.title'),
      icon: '$alertwarning',
      color: 'error',
      buttons: deleteDomainButtons(deps.t),
      confirmRequired: true,
    }, {})
  }

  function openSetPrimary (row: HostingDomain): void {
    // The switch keeps a PanelAlpha Online address served as an addon domain, but the Engine never makes such a name the
    // project's main domain again, so the dialog says so before the user confirms.
    const mainDomain = deps.rows().find(candidate => candidate.type === 'main')?.domain ?? null
    openRow(row, {
      mode: 'set-primary',
      title: deps.t('heading.hosting.domains.modal.setAsPrimary.title'),
      icon: '$starFullIcon',
      message: setPrimaryMessage(row.domain, deps.t, mainDomain),
      buttons: setPrimaryButtons(deps.t),
    }, {})
  }

  function close (): void {
    open.value = false
  }

  /** The `onBlur` of the `redirect_url` field. */
  function onFieldBlur (name: string | undefined): void {
    if (name === 'redirect_url') {
      values.redirect_url = normalizeRedirectUrl(values.redirect_url as string | null | undefined)
    }
  }

  // Leaving the page while the primary domain is being set warns.
  let settingPrimary = false
  function handleBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!settingPrimary) {
      return undefined
    }
    const message = 'Setting primary domain is in progress. Leaving the page may cause the process to fail.'
    event.returnValue = message
    return message
  }
  function disableBeforeUnloadGuard (): void {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
  function enableBeforeUnloadGuard (): void {
    disableBeforeUnloadGuard()
    window.addEventListener('beforeunload', handleBeforeUnload)
  }
  if (getCurrentScope()) {
    onScopeDispose(disableBeforeUnloadGuard)
  }

  /** The shared `.then` / `.catch` / `.finally` of the update, delete and set-as-primary requests. */
  async function runRowRequest (request: () => Promise<void>, onSuccess: () => string): Promise<void> {
    persistent.value = true
    submitting.value = true
    if (modal.value) {
      modal.value.alert = undefined
    }
    try {
      await request()
      const message = onSuccess()
      deps.addSuccessAlert(message)
      open.value = false
    } catch (error) {
      const message = deps.getErrorMessage(error)
      deps.addErrorAlert(message)
      if (modal.value) {
        const refusal = modal.value.mode === 'edit-domain' ? editDomainRefusal(error) : null
        editFieldErrors.value = refusal?.fields ?? {}
        modal.value.alert = refusal?.message === '' ? undefined : (refusal?.message ?? message)
      }
    } finally {
      persistent.value = false
      submitting.value = false
    }
  }

  /** The whole element goes out; the row is highlighted and the list reloads newest first. */
  async function updateDomain (row: HostingDomain): Promise<void> {
    await runRowRequest(
      async () => deps.updateDomain(row.serverAccountId, row.domain, updatePayload(row, values)),
      () => {
        const message = deps.t('notification.hosting.domain.update.success', { type: row.type_text })
        deps.highlight(row.domain)
        void deps.reload(true)
        return message
      },
    )
  }

  /** No highlight, a plain reload. */
  async function deleteDomain (row: HostingDomain): Promise<void> {
    await runRowRequest(
      async () => deps.deleteDomain(row.serverAccountId, row.domain),
      () => {
        const message = deps.t('notification.hosting.domain.delete.success', { type: row.type_text })
        void deps.reload()
        return message
      },
    )
  }

  /** Guarded against leaving the page while it runs. */
  async function setPrimaryDomain (row: HostingDomain): Promise<void> {
    settingPrimary = true
    enableBeforeUnloadGuard()
    try {
      await runRowRequest(
        async () => deps.setPrimaryDomain(row.serverAccountId, row.domain),
        () => {
          const message = deps.t('notification.hosting.domain.setAsPrimaryDomain.success', { domain: row.domain })
          void deps.reload()
          deps.refreshInstance?.()
          return message
        },
      )
    } finally {
      settingPrimary = false
      disableBeforeUnloadGuard()
    }
  }

  /** The `onChange` of the `type` select. */
  function onTypeChange (type: unknown): void {
    hidden.value = domainInputsHiddenAfterTypeChange(String(type), hidden.value)
  }

  function addValues (): AddDomainValues {
    return {
      type: String(values.type ?? ''),
      domain: (values.domain as string | null) ?? null,
      parent_domain: (values.parent_domain as string | null) ?? null,
      target_domain: (values.target_domain as string | null) ?? null,
    }
  }

  // Legacy lets a second click send the add again, because the flags are cleared by the verify while the request still runs. The flags
  // stay as they were (the look is the legacy one); this one stops the second request.
  let addInFlight = false

  /**
   * An addon opens the "Set Your Domain" step only when `DnsOptions` has a panel to show; otherwise the dialog closes
   * after the success alert, as for the other types.
   */
  async function addDomain (formValues: AddDomainValues): Promise<void> {
    const account = deps.account()
    if (!account || addInFlight) {
      return
    }
    addInFlight = true
    persistent.value = true
    submitting.value = true
    const payload = addDomainPayload(formValues)
    try {
      await deps.addDomain(account.id, { ...payload })
      const message = deps.t('notification.hosting.domain.create.success', { type: addedDomainTypeLabel(payload.type, deps.t) })
      deps.highlight(payload.domain ?? '')
      deps.resetCertificateCache(account.id)
      void deps.reload(true)
      deps.addSuccessAlert(message)
      if (payload.type === 'addon' && hasDomainDnsInstructions(deps.service(), account, payload.domain ?? '')) {
        showDnsInstructions(payload.domain ?? '')
      } else {
        open.value = false
      }
    } catch (error) {
      const message = deps.getErrorMessage(error)
      deps.addErrorAlert(message)
      if (isRefusedDomainAdd(error) && modal.value?.mode === 'add-domain') {
        domainFieldErrors.value = [message]
      }
    } finally {
      addInFlight = false
      persistent.value = false
      submitting.value = false
    }
  }

  /**
   * The transfer check before the add. `addDomain` runs inside the `then`, so the `finally` of this
   * request clears the flags that the add has just set (legacy quirk, kept).
   */
  async function verifyDomain (formValues: AddDomainValues): Promise<void> {
    persistent.value = true
    submitting.value = true
    const data = { ...formValues }
    if (data.type === 'sub') {
      data.domain = `${data.domain ?? ''}.${data.parent_domain ?? ''}`
    }
    try {
      const response = await deps.verifyDomain(deps.service().id, data.domain ?? '')
      if (response.verification_required) {
        persistent.value = false
        open.value = false
        transfer.domain = data
        transfer.record = (response.verification_record as TransferDnsRecord | undefined) ?? null
        transfer.open = true
        return
      }
      void addDomain(formValues)
    } catch (error) {
      deps.addErrorAlert(deps.getErrorMessage(error))
    } finally {
      persistent.value = false
      submitting.value = false
    }
  }

  function closeTransfer (): void {
    transfer.open = false
  }

  /**
   * The Add runs with the values the check kept, a subdomain already suffixed (so `addDomain` suffixes it
   * again, legacy quirk). The transfer dialog stays open after it, as in legacy.
   */
  async function transferDomain (): Promise<void> {
    await addDomain({ ...transfer.domain })
  }

  /** A click on a button of the dialog; `validate` is the `BasicModal` form. */
  async function onButton (id: string, validate: ValidateForm): Promise<void> {
    const current = modal.value
    if (!current) {
      return
    }
    if (id === 'cancel' || id === 'close') {
      close()
      return
    }
    if (current.mode === 'add-domain' && id === 'submit') {
      const result = await validate()
      if (!result.valid) {
        return
      }
      await (deps.service().server_settings?.domain_transfer_allowed ? verifyDomain(addValues()) : addDomain(addValues()))
      return
    }
    if (id !== 'submit' || !current.row) {
      return
    }
    // Set as primary has no form, so there is nothing to validate; Edit and Delete validate first.
    if (current.mode === 'edit-domain' || current.mode === 'delete-domain') {
      const result = await validate()
      if (!result.valid) {
        return
      }
    }
    switch (current.mode) {
      case 'edit-domain': {
        await updateDomain(current.row)

        break
      }
      case 'delete-domain': {
        await deleteDomain(current.row)

        break
      }
      case 'set-primary': {
        await setPrimaryDomain(current.row)

        break
      }
    // No default
    }
  }

  return {
    open,
    persistent,
    submitting,
    render,
    modal,
    values,
    fields,
    showDnsOptions,
    dnsOptionsDomain,
    openAdd,
    openEdit,
    openDelete,
    openSetPrimary,
    close,
    onFieldBlur,
    onTypeChange,
    onButton,
    addDomain,
    transfer,
    closeTransfer,
    transferDomain,
  }
}
