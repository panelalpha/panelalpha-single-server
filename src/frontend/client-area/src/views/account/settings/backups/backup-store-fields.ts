import type { FreeBackupStore, FreeBackupStoreUpdate } from './free-backups.api'

// The fields per driver and the rules for their start values and the payload.

export interface StoreField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'textarea' | 'switch'
  required?: boolean
  hint?: string
  /** Goes into `credentials`; the rest is the store's `location`. */
  credential?: boolean
}

export type StoreValue = string | number | boolean | null | undefined
export type StoreValues = Record<string, StoreValue>

const FTP_FIELDS: StoreField[] = [
  { key: 'host', label: 'settings.backups.fields.host', type: 'text', required: true, credential: true },
  { key: 'port', label: 'settings.backups.fields.port', type: 'number', required: true, credential: true },
  { key: 'username', label: 'settings.backups.fields.username', type: 'text', required: true, credential: true },
  { key: 'password', label: 'settings.backups.fields.password', type: 'password', required: true, credential: true },
  { key: 'location', label: 'settings.backups.fields.remotePath', type: 'text', required: true },
]

export const STORE_FIELDS: Record<string, StoreField[]> = {
  local: [
    { key: 'location', label: 'settings.backups.fields.path', type: 'text', required: true, hint: 'settings.backups.fields.pathHint' },
  ],
  s3: [
    { key: 'access_key_id', label: 'settings.backups.fields.accessKeyId', type: 'text', required: true, credential: true },
    { key: 'secret_access_key', label: 'settings.backups.fields.secretAccessKey', type: 'password', required: true, credential: true },
    { key: 'region', label: 'settings.backups.fields.region', type: 'text', required: true, credential: true },
    { key: 'endpoint', label: 'settings.backups.fields.endpoint', type: 'text', credential: true },
    { key: 'use_path_style_endpoint', label: 'settings.backups.fields.pathStyle', type: 'switch', credential: true },
    { key: 'location', label: 'settings.backups.fields.bucket', type: 'text', required: true },
  ],
  sftp: [
    { key: 'host', label: 'settings.backups.fields.host', type: 'text', required: true, credential: true },
    { key: 'port', label: 'settings.backups.fields.port', type: 'number', required: true, credential: true },
    { key: 'username', label: 'settings.backups.fields.username', type: 'text', required: true, credential: true },
    { key: 'password', label: 'settings.backups.fields.password', type: 'password', credential: true },
    { key: 'private_key', label: 'settings.backups.fields.privateKey', type: 'textarea', credential: true },
    { key: 'passphrase', label: 'settings.backups.fields.passphrase', type: 'password', credential: true },
    { key: 'location', label: 'settings.backups.fields.remotePath', type: 'text', required: true },
  ],
  ftp: FTP_FIELDS,
  ftps: FTP_FIELDS,
}

export const DEFAULT_PORT: Record<string, number> = { sftp: 22, ftp: 21, ftps: 21 }

/** Opens on the active store's driver; a driver the form or the Engine does not know falls back to `local`. */
export function initialDriver (currentStore: FreeBackupStore | null | undefined, drivers: string[]): string {
  const current = currentStore?.driver
  return current && Object.hasOwn(STORE_FIELDS, current) && drivers.includes(current) ? current : 'local'
}

/** The active store's location is kept for its own driver; secrets always start empty. */
export function initialValues (driver: string, currentStore: FreeBackupStore | null | undefined, defaultLocalLocation: string): StoreValues {
  const values: StoreValues = {}
  for (const field of STORE_FIELDS[driver] ?? []) {
    values[field.key] = field.type === 'switch' ? false : ''
  }
  if (driver === 'local') {
    values.location = defaultLocalLocation
  }
  if (currentStore && currentStore.driver === driver) {
    values.location = currentStore.location
  }
  if (Object.hasOwn(DEFAULT_PORT, driver)) {
    values.port = DEFAULT_PORT[driver]
  }
  return values
}

/** Empty optional values are left out; a `textarea` value is sent as entered (a key's surrounding lines matter). */
export function storePayload (driver: string, values: StoreValues): FreeBackupStoreUpdate {
  const credentials: Record<string, unknown> = {}
  for (const field of STORE_FIELDS[driver] ?? []) {
    if (!field.credential) {
      continue
    }
    const value = values[field.key]
    switch (field.type) {
      case 'switch': {
        credentials[field.key] = !!value
        break
      }
      case 'number': {
        credentials[field.key] = Number.parseInt(String(value), 10)
        break
      }
      case 'textarea': {
        if (typeof value === 'string' && value.trim() !== '') {
          credentials[field.key] = value
        }
        break
      }
      default: {
        if (value !== '' && value !== null && value !== undefined) {
          credentials[field.key] = typeof value === 'string' ? value.trim() : value
        }
      }
    }
  }
  const body: FreeBackupStoreUpdate = { driver, location: String(values.location || '').trim() }
  if (driver !== 'local') {
    body.credentials = credentials
  }
  return body
}
