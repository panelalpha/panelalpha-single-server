import { api, apiBaseUrl } from '@/shared/api/client'

// Only the fields the screen reads are typed; there is no billing controller or fixture in the bundle.

export interface Invoice {
  id: number | string
  /** Optional; the table shows the id when it is missing. */
  number?: string | null
  date: string
  duedate: string
  /** The raw amount: sorted and searched, never shown. */
  total: number | string
  total_formatted: string
  status: string
}

export interface BillingDetails {
  firstname: string
  lastname: string
  companyname: string
  address1: string
  postcode: string
  city: string
  state: string
  country: string
  invoices: Invoice[]
}

/** `GET /billing`: `null` when the client has no billing account. */
export async function getBilling (): Promise<BillingDetails | null> {
  const response = await api.get('/billing')
  return response.data.data
}

/** `POST /billing/invoices/{id}/payment-url`: `data` is the payment page URL (the caller validates it). */
export async function getInvoicePaymentUrl (id: number | string): Promise<unknown> {
  const response = await api.post(`/billing/invoices/${id}/payment-url`)
  return response.data.data
}

/** The PDF is loaded by the browser (`window.open`), not by XHR, so the screen needs the URL. */
export function invoiceDownloadUrl (id: number | string): string {
  return `${apiBaseUrl()}/billing/invoices/${id}/download`
}
