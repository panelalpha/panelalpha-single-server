// The icon per backup store driver; FTPS and SFTP share the FTP icon, as in the admin area.
export const DRIVER_ICONS: Record<string, string> = {
  local: '$storage',
  s3: '$backupS3',
  ftp: '$backupFtp',
  ftps: '$backupFtp',
  sftp: '$backupFtp',
}

export function driverIcon (driver: string): string {
  return Object.hasOwn(DRIVER_ICONS, driver) ? DRIVER_ICONS[driver]! : '$storage'
}

// Defaults used until `GET /community/backups` sends its own.
export const DEFAULT_DRIVERS: readonly string[] = ['local', 's3', 'sftp', 'ftp', 'ftps']
export const DEFAULT_LOCAL_LOCATION = '/opt/panelalpha/backups'
