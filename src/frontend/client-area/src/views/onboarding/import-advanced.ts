import type { WordpressConnectionBody, WordpressConnectionResult } from './onboarding.api'

// The FTP / FTPS / SFTP form of the import. The
// modal keeps the state and the DOM; this module holds the rules that do not need them.

export const FTP_PROTOCOLS = ['FTP', 'FTPS', 'SFTP'] as const
export type FtpProtocol = (typeof FTP_PROTOCOLS)[number]

/** The default protocol and port on open and on reset. A protocol switch never changes the port. */
export const DEFAULT_FTP_PROTOCOL: FtpProtocol = 'FTP'
export const DEFAULT_FTP_PORT = 21

/** The default auth method; the other value is `ssh_key`. */
export const DEFAULT_SFTP_AUTH_METHOD = 'password'

/** The demo mock: the hostname that rejects, and the delay of the mock success. */
export const DEMO_REJECT_HOSTNAME = 'reject'
export const DEMO_CONNECTION_DELAY_MS = 2000

/**
 * What the advanced form reads: the import url of the URL step and the fields of the form. The
 * FTP fields (`username`, `password`) and the SFTP fields (`sftp*`) are kept apart, as legacy keeps them.
 */
export interface AdvancedFormValues {
  importUrl: string | null | undefined
  hostname: string
  protocol: string
  port: number | string
  username: string
  password: string
  installedPath: string
  authMethod: string
  sftpUsername: string
  sftpPassword: string
  sftpPrivateKey: string
  sftpPassphrase: string
}

/**
 * The form is checked by its rules first, and only an invalid
 * form is checked for these values. A SFTP form also reads the FTP `username` and `password`, which stay empty there.
 */
export function hasEmptyRequiredFields (values: AdvancedFormValues): boolean {
  return values.hostname === ''
    || values.protocol === ''
    || values.port === ''
    || values.username === ''
    || values.password === ''
    || values.installedPath === ''
}

/**
 * The FTP shape of `POST /instances/import/test-wordpress-connection`. The url and the
 * path go as typed (legacy does not trim them), the protocol is lowercased, and only the fields of the chosen protocol are sent.
 * `ip_address` is not sent here (a gap kept from legacy).
 */
export function buildFtpTestBody (values: AdvancedFormValues, serviceId: number | string): WordpressConnectionBody {
  const protocol = values.protocol.toLowerCase()
  const body: WordpressConnectionBody = {
    type: 'ftp',
    service_id: serviceId,
    url: values.importUrl ?? '',
    protocol,
    path: values.installedPath,
  }

  switch (protocol) {
    case 'ftp': {
      body.ftp_host = values.hostname
      body.ftp_port = values.port
      body.ftp_username = values.username
      body.ftp_password = values.password
      break
    }
    case 'ftps': {
      body.ftps_host = values.hostname
      body.ftps_port = values.port
      body.ftps_username = values.username
      body.ftps_password = values.password
      break
    }
    case 'sftp': {
      body.sftp_host = values.hostname
      body.sftp_port = values.port
      body.sftp_auth_method = values.authMethod
      body.sftp_username = values.sftpUsername
      if (values.authMethod === DEFAULT_SFTP_AUTH_METHOD) {
        body.sftp_password = values.sftpPassword
      } else {
        body.sftp_private_key = values.sftpPrivateKey
        if (values.sftpPassphrase) {
          body.sftp_private_key_passphrase = values.sftpPassphrase
        }
      }
      break
    }
    default: {
      // Like legacy, the switch has no default: an unknown protocol sends the shared fields only.
      break
    }
  }

  return body
}

/**
 * The demo mock: the demo account gets a success after 2 s, except for the hostname
 * `reject`, which rejects at once with `false`. No request is sent.
 */
export function demoConnectionTest (hostname: string, delayMs: number = DEMO_CONNECTION_DELAY_MS): Promise<WordpressConnectionResult> {
  return new Promise((resolve, reject) => {
    if (hostname === DEMO_REJECT_HOSTNAME) {
      reject(false)
      return
    }
    setTimeout(() => {
      resolve({ success: true })
    }, delayMs)
  })
}
