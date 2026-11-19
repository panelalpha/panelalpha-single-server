import { describe, expect, it } from 'vitest'
import { driverIcon } from './backup-drivers'

describe('driverIcon', () => {
  it.each([
    ['local', '$storage'],
    ['s3', '$backupS3'],
    ['ftp', '$backupFtp'],
    ['ftps', '$backupFtp'],
    ['sftp', '$backupFtp'],
  ])('maps %s to %s', (driver, icon) => {
    expect(driverIcon(driver)).toBe(icon)
  })

  it('falls back to the storage icon for an unknown driver', () => {
    expect(driverIcon('dropbox')).toBe('$storage')
    expect(driverIcon('toString')).toBe('$storage')
  })
})
