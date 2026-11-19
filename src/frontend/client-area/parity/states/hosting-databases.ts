import type { Handler } from './state'
import { GB, serverAccount } from './hosting'

// Builders of the MySQL side of the Databases screen (S-35 phase 1): the `/server-accounts/{id}/mysql/*` answers in the shapes of
// research §4 (`BE/app/Http/Controllers/User/ServerAccount/Mysql/*`). Not a spec file (testMatch is `*.parity.ts`). The fixtures are
// hand-written, not recorded from a live account (roadmap Open Question 5a).

/** The account with the phpMyAdmin SSO host set, as the Databases screen reads it (`details.mysql_php_my_admin_sso_host`). */
export function mysqlAccount (overrides: Record<string, unknown> = {}) {
  return serverAccount({
    details: { homedir: '/home/example', mysql_db_prefix: 'example_', mysql_php_my_admin_sso_host: 'example.com' },
    ...overrides,
  })
}

/** A second account of the same service (state `hosting-databases-accounts`). */
export function secondMysqlAccount () {
  return mysqlAccount({
    id: 12,
    domain: 'second.example.com',
    details: { homedir: '/home/second', mysql_db_prefix: 'second_', mysql_php_my_admin_sso_host: 'second.example.com' },
  })
}

/** Three databases, newest first as the backend sorts them (`DatabaseCollection`, `sortByDesc('updated_at')`). */
export const databasesFixture = [
  { database: 'example_shop', disk_usage: 50 * 1024 ** 2, created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-10-04T12:00:00.000Z' },
  { database: 'example_blog', disk_usage: 12 * 1024 ** 2, created_at: '2026-09-02T08:30:00.000Z', updated_at: '2026-09-28T08:30:00.000Z' },
  { database: 'example_forum', disk_usage: GB, created_at: '2026-07-15T09:00:00.000Z', updated_at: '2026-08-15T09:00:00.000Z' },
]

/** `GET …/mysql/databases`. `rename` is `meta.actions.rename` (Edit on the row). */
export function mysqlDatabasesBody (items: unknown[] = databasesFixture, rename = true) {
  return { data: items, meta: { actions: { rename } } }
}

/** Two users; `databases` are the names they have privileges on. Used by the Users tab (phase 3) and held here for the states that load it. */
export const usersFixture = [
  { user: 'example_admin', databases: ['example_shop', 'example_blog'], created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z' },
  { user: 'example_reader', databases: ['example_forum'], created_at: '2026-08-10T10:00:00.000Z', updated_at: '2026-08-20T12:00:00.000Z' },
]

/** `GET …/mysql/users`: the backend answers `require_database_to_create: false` (`UserController.php:44-50`). */
export function mysqlUsersBody (items: unknown[] = usersFixture) {
  return {
    data: items,
    meta: { require_database_to_create: false, privileges_supported: true, rename_supported: true },
  }
}

/** `GET …/mysql/server-info` (`DatabaseController.php:129-135`): the host and port the Access details modal shows. */
export function mysqlServerInfoBody () {
  return { data: { host: 'localhost', port: 3306 } }
}

/**
 * `GET …/mysql/privileges/{user}/{db}` (`PrivilegesController.php:33-44`) for one user: the answer per database name. A database that is not
 * listed gets no answer, so a state only opens the rows it lists.
 */
export function mysqlPrivilegesHandlers (accountId: number, user: string, answers: Record<string, string[]>): Record<string, Handler> {
  return Object.fromEntries(Object.entries(answers).map(([database, privileges]) => [
    `GET /server-accounts/${accountId}/mysql/privileges/${user}/${database}`,
    { json: { data: privileges } },
  ]))
}

/**
 * The MySQL handlers of one account (`METHOD /path` keys, the `/api` prefix left out). A state overrides a key by passing it again
 * in its own `handlers`. Each argument is a `Handler` (an answer, `'hold'`, or a sequence).
 */
export function mysqlHandlers (accountId: number, options: { databases?: Handler, users?: Handler } = {}): Record<string, Handler> {
  return {
    [`GET /server-accounts/${accountId}/mysql/databases`]: options.databases ?? { json: mysqlDatabasesBody() },
    [`GET /server-accounts/${accountId}/mysql/users`]: options.users ?? { json: mysqlUsersBody() },
    [`GET /server-accounts/${accountId}/mysql/server-info`]: { json: mysqlServerInfoBody() },
  }
}
