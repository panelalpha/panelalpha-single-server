# Panel ↔ PanelAlpha Hub contract (Community and the paid panel)

This is the API the v1 panel calls on PanelAlpha Hub, and what it expects back. It replaces the missing
`PANEL-LOGIN-CONTRACT.md`. The protocol lives in `panelalpha/hub` (`PanelAlpha\Hub`: `HubClient`, `HubPairing`,
`HubLoginTicket`, `HubDisconnection`, the `hub:report` and `hub:disconnect` commands), shared by
both products: Community (`panelalpha/community`) and the paid Pro/Multi panel (`panelalpha/admin-area-controller`).
Each product binds where the pairing is stored (`Contracts\HubSettings`) and what the panel tells the Hub
(`Contracts\HubPanel`); the HTTP routes and whom a ticket signs in are its own. The production Hub
(`https://hub.panelalpha.com`) serves it; this package never changes the Hub.

| | Community | Paid (Pro, Multi) |
|---|---|---|
| `product` | `single-server-community` (since 2026-11-19; `single-server-free` from 2026-10-30, `single` before; the Hub accepts both `single-server-*` values as the same panel since its 727b0418, 2026-11-17) | `single` (Pro), `multi` (Multi; the plan's `multi_server`) |
| `license_key` | `null` | the `licensekey` system setting (`null` when empty) |
| Report `apps` | the synced projects | `[]` |
| Pairing stored in | `settings` | `system_settings` |
| Connect | setup wizard step 1, Settings → PanelAlpha Connect: `/api/community/hub/{status, start, complete, cancel, disconnect}` | the configuration wizard `/api/admin/configurator/hub{, /start, /complete, /cancel}`; the Admin Area settings `/api/admin/settings/hub{, /start, /complete, /cancel, /disconnect}` (backend only, 2026-10-30; only the main admin may pair, §8) |
| Ticket login | `GET /api/hub-login/start`, `POST /api/hub-login` (the Client Area's one user) | `POST /api/admin/hub-login` (the main admin; Pro only, the plan's `admin_hub_login`) |
| Report details (§6: `host`, rates, app facts) and events (§6a) | sent | – (neither yet) |

In Community, Connect is the first option on step 1 of the setup wizard (the local form is the other); the panel talks to the
Hub when the visitor connects, and the report runs only while the panel is paired. The Hub origin is `hub.url` =
`HUB_URL` (default `https://hub.panelalpha.com`), called `{hub}` below. All bodies are JSON (`Accept: application/json`). The panel does
not follow redirects and uses a 15 s timeout (5 s for `poll`).

## 1. Flow

1. The panel creates a **connect request** (§2) and gets a `device_code` (secret, panel only), a `user_code` and a
   `link`.
2. The browser is sent to `link` with `&state=<random>` appended. The user signs in on the Hub and approves or denies.
3. The Hub sends the browser back to `<admin_url>/hub-connected?state=<state>&result=approved|denied` (§4).
4. The panel checks `state`, polls the request (§3) and stores the pairing `{server_id, server_secret}`. While the
   first-run setup is still required (no user yet), the same step also creates the admin from the Hub user who approved
   (`user`, §3), saves the server name and sends the first report, all in one transaction, and signs the admin in.
5. From then on the panel sends a signed **report** (§6), right after pairing and every five minutes.

## 2. Create a connect request

`POST {hub}/api/panel/v1/connect-requests` (unsigned)

```json
{
  "product": "single-server-community",
  "panel": {
    "version": "2.0.0-beta",
    "admin_url": "https://panel.example.com",
    "hostname": "box.example.com",
    "ip": "203.0.113.7"
  },
  "license_key": null
}
```

- `product` is `single-server-community` in Community, `single` in Pro and `multi` in Multi (`HubPanel::product()`).
  `license_key` is `null` in Community and the panel's licence key in the paid product.
- `panel.admin_url` is the **origin** (scheme, host, optional port; no path) of the area the user is on. It is
  where the Hub returns the browser (§4). In Community a signed-in user's own address is used; for a guest (the setup wizard)
  the client value is ignored and the panel's own base URL (`PanelUrl::base()`) is sent, so an unauthenticated caller
  cannot point the approver's browser at another origin. The paid product sends the admin's address, else the Admin
  Area's own (`adminapp.url`).
- Community: `panel.hostname` and `panel.ip` come from the Engine's `system/info` (`default_ipv4`); when the
  Engine is unreachable the panel sends the `admin_url` host and `""`. The host name is the server's own, never a
  container's (2026-11-19): `host.hostname` when it is a full name, else `cert_domain` (the name the Engine holds a
  certificate for, the server's own name the panel starts on), else a bare `host.hostname` except `engine` (the
  Engine reads it from its Docker daemon, which names its own container when it runs in one), else the `admin_url`
  host. Paid: `HOST_HOSTNAME`, else the `admin_url`
  host, else the container's host name, and the `host_ip_address` system setting.

**201 Created**

```json
{
  "device_code": "…",
  "user_code": "ABCD-1234",
  "link": "https://hub.panelalpha.com/connect/ABCD",
  "expires_in": 900
}
```

- `link` must be on the configured Hub origin (same scheme, host and port), or the panel refuses it (502 to the
  browser).
- `expires_in` is in seconds. The panel assumes 900 when it is missing and clamps it to 60–1800.

**Errors:** `429` (too many attempts) is shown as "try again in a minute". Any other non-201 is shown as a refusal:
`{"error":"invalid_address"}` (the panel needs a public IP and an `https://` URL) or `{"message":"…"}`, which the
panel shows as given.

## 3. Poll and cancel

`POST {hub}/api/panel/v1/connect-requests/poll` (unsigned), body `{"device_code":"…"}`

**200 OK, approved**

```json
{
  "server_id": "srv_1",
  "server_secret": "…",
  "hub_url": "https://hub.panelalpha.com",
  "account": { "name": "Acme" },
  "approved_by": "a***@example.com",
  "user": { "id": 128, "email": "ada@example.com", "name": "Ada Lovelace" }
}
```

- `server_id` and `server_secret` must both be non-empty, or the panel treats the answer as incomplete.
- `hub_url` is stored only when it is on the configured Hub origin; otherwise `HUB_URL` is used. Only its origin is
  kept (any path is dropped), because the report path is signed without a base path (§6).
- `account.name` is shown in the wizard; it may be missing.
- `user` (`PANEL-LOGIN-CONTRACT.md` 1.4, Hub `e909f456`, live since 2026-11-06) is the Hub user who approved the
  request, the same person a login ticket for them names: `id` is the ticket's `sub` (a number here, a string there),
  `email` their own address, trimmed and lowercase, exactly what their ticket carries, `name` their display name (may be
  empty). It is `null` when the Hub has no real email for them (an impersonated Hub session) or their account is gone.
  The panel reads it with `PanelAlpha\Hub\HubConnectedUser`: a missing key, a non-object or an invalid email is no
  user; an empty name becomes the part before the `@`. Only its `id` is stored, with the pairing (`hub.user_id`, as a
  string; `HubPairing::hubUserId()`): it is the one `sub` a login ticket may name (§8). The rest is kept in memory
  only (the answer holds `server_secret`).
  `approved_by` is masked and only for display; the panel does not read it. The Hub never sent the `approver` field the
  panel read until 2026-11-06, so a Community setup through Connect always ended "unsupported".
- **Community:** every pairing needs a `user` with an integer `id`: an approved answer without one (an impersonated Hub
  session, an older Hub) is not completed, from the setup wizard or from Settings, and the request is cancelled on the
  Hub (`status: unsupported`). While the setup is required, `user` becomes the setup admin (`password_generated`),
  in the same transaction as the pairing and the first report, and the admin is signed in. Once
  the setup is done, `user` only names who connected the panel (`Connected to PanelAlpha` in the application log,
  with `by`): Community holds one user, so it never creates a second one, and never changes the one it has.
- **Paid (Admin Area):** `user` only names who connected the panel, as the `PanelAlpha` resource of the
  `admin.wizard.hub.complete` activity entry. No admin is created from it: the Admin Area's Hub login signs in the main
  admin (§8), so an admin made for the Hub user's email would never be the one a ticket lands in.
- **Assumption:** the panel trusts the Hub to have verified `user.email`: it arrives over the same channel and at the
  same moment as `server_secret`, and the setup admin is created with `email_verified_at` set.
- **Differences from the Hub team's brief** (decided 2026-11-06): the brief
  has every pairing find or create an admin by `user.email` and log nobody in. Community creates its admin only during the
  first-run setup (it cannot hold a second user, which the brief asks the panel to tell the Hub team), and signs it in
  there, as nobody else is signed in yet. The Admin Area creates none (above). The installer's `--hub-code` claim is
  §5a (Community only); the installer itself, and its `y/N` line, are not part of this repository.

**Pending and final answers** (any 4xx body with an `error`):

| Answer | Panel behaviour |
|---|---|
| `{"error":"authorization_pending"}` (400) | Keep polling, 1 s apart |
| `{"error":"slow_down"}` (400) | Keep polling, 3 s apart |
| `{"error":"access_denied"}` (400) | Final: shown as denied |
| other 4xx except 429 (`expired_token`, unknown code) | Final: shown as expired |
| 429, 5xx, transport errors | Retried until the deadline |

The panel polls for at most 10 s per browser return, then answers "not confirmed yet"; the user can retry with the same
`state` until the request expires.

`POST {hub}/api/panel/v1/connect-requests/cancel` (unsigned), body `{"device_code":"…"}`. Sent when the user is denied
or cancels. The answer is ignored, and an unconfirmed request expires on the Hub anyway.

The panel may also cancel **after an approved poll** when it did not send the first report: the approved answer had no
`user` with a valid email (Community's first-run setup), or a local setup finished first and won the race (the panel
answers 409). The Hub then drops the unconfirmed pairing.

It also cancels, and forgets the pairing, when anything else fails inside the setup transaction (a database or settings
write error): the rollback leaves nothing on the panel, and the browser gets `expired` ("Start again").

## 4. Browser return

The Hub redirects the browser to

```
<admin_url>/hub-connected?state=<state>&result=approved|denied
```

- `state` is the value the panel appended to `link`. The Hub passes it back unchanged. The panel compares it with
  `hash_equals`, accepts it once, and keeps it only in the visitor's session (a guest during the setup). A mismatch is "This connection was
  not started here."
- A second return of the same session while one is still polling (second tab, double click) answers
  `409 {"message":"…","code":"confirming"}` without polling; the `state` is not spent and the wizard offers "check
  again". Any other 409 from `complete` means the setup is already done.
- `result` other than `approved` is treated as denied.

## 5. Device-code lifetime

The panel keeps the request for `expires_in` seconds (default 900) from creation. After that the return is shown as
expired and the user starts again. The panel never sends `device_code` to the browser and never logs it.

## 5a. Install code (2026-11-09, Community)

The one-line installer's `--hub-code` (Hub contract 1.7). The installer deploys the panel with
`PANELALPHA_USER_EMAIL`, `PANELALPHA_USER_PASSWORD` and `PANELALPHA_HUB_CODE`; at the first boot the entrypoint runs
`php artisan hub:claim-install-code <email>` with the code and the password on stdin, once (the marker
`/app/data/hub-install-code-claimed` is written before the call), and only while the setup is still required.

```
POST /api/panel/v1/install-codes/claim
{"code":"WDJB-MJHT","email":"ada@example.com","product":"single-server-community",
 "panel":{"version":"…","admin_url":"https://panel.example.com","hostname":"box.example.com","ip":"203.0.113.7"}}
```

- `email` is the panel's addition to contract 1.7: the Hub accepts the code only for its creator's email and answers
  `invalid_grant` otherwise, as for an unknown code. A Hub that does not know the field ignores it.
- `200`: the poll's answer (§3). Its `user.email` must equal `email` and `user.id` must be set, or nothing is stored
  (the id is the pairing's `hub.user_id`, §8). The admin is created from
  `user` with the installer's password (a generated one without it), the server name is the Engine host name, then the
  pairing and the first report, in one transaction (§3 "Activating"); a 401 on that report rolls it all back.
- Any refusal (`400 invalid_grant` / `expired_token`, `422 invalid_address` / `wrong_product`, `429`, 5xx, no network)
  changes nothing: one attempt, no retry. The entrypoint's first-user step then creates the admin from
  `PANELALPHA_USER_*`, unpaired, and the owner connects later from Settings.
- Exit codes: 0 connected, 2 refused, 3 the setup was done already, 1 an unexpected failure. The code, the password
  and `server_secret` are never printed or logged.

## 6. Signed report

`POST {hub}/api/panel/v1/report`, sent right after pairing and by `hub:report` every five minutes (`onOneServer()`,
`withoutOverlapping()`) while the panel is paired. It does nothing when the switch is off or the panel is unpaired.

**Headers**

| Header | Value |
|---|---|
| `X-Server-Id` | the pairing's `server_id` |
| `X-Timestamp` | Unix time in seconds, as a string |
| `X-Signature` | `hex(HMAC-SHA256(server_secret, canonical))` |

**Canonical string**, four lines joined by `\n`, with no trailing newline:

```
POST
api/panel/v1/report
<X-Timestamp>
<hex sha256 of the raw request body>
```

The path has **no leading slash**: it is the Hub's `$request->path()`. The hash covers the exact bytes sent; the panel
encodes JSON with unescaped slashes.

**Body**

```json
{
  "apps": [{
    "id": "12", "name": "shop", "type": "custom", "status": "active", "public_url": "https://shop.example.com",
    "domain": "shop.example.com", "created_at": "2026-09-14T08:21:00Z", "framework": "Next.js", "healthy": true,
    "allocation": { "cpu_cores": 1.5, "memory_bytes": 1073741824, "disk_bytes": null },
    "usage": { "cpu_percent": 8.4, "memory_bytes": 412090368, "memory_limit_bytes": 1073741824 },
    "disk": { "bytes": 3221225472, "files_bytes": 2684354560, "docker_bytes": 536870912, "measured_at": "2026-11-19T08:45:00Z" },
    "containers": [{ "name": "shop-app-1", "service": "app", "cpu_percent": 6.1, "memory_bytes": 301989888, "memory_limit_bytes": 1073741824 }]
  }],
  "panel_version": "2.0.0-beta",
  "admin_sso_supported": true,
  "admin_url": "https://panel.example.com",
  "product": "single-server-community",
  "resource_usage": {
    "cpu_percent": 12.5, "ram_percent": 41.0, "disk_percent": 28.3,
    "cpu_cores": 4, "ram_total_bytes": 8589934592, "disk_total_bytes": 107374182400,
    "net_in_bps": 184320, "net_out_bps": 921600, "disk_read_bps": 40960, "disk_write_bps": 204800
  },
  "engine_version": "2.3.1",
  "host": {
    "hostname": "srv1", "os": "Ubuntu 24.04.3 LTS", "kernel": "6.8.0-85-generic",
    "uptime_seconds": 864000, "public_ipv4": "203.0.113.7"
  }
}
```

- `product` is as in §2. In the paid product `apps` is always `[]`.
- Community: `apps` is built from the panel's synced projects (no Engine call but `containers`, below), at most 500 entries, each `{name, type, status}`
  as strings (`type` is `""` when not detected), plus `public_url` (below). `name` is the name the Client Area shows: the project's own name, else
  its Engine username, else its domain; it is never empty, because the Hub refuses the whole report (422) for an empty
  `apps.*.name` and a pairing whose reports all fail is never confirmed there. With no projects it is `[]`, and the report is still sent: the Hub
  treats the panel as connected from its first signed report.
- `public_url` (Community, 2026-11-17): the site's address (`https://` + the mirrored domain), left out for a project
  without a domain, so the Hub links the app like an app on a connected Engine.
- `resource_usage` and `engine_version` (Community, 2026-11-17): what the Hub shows for a connected Engine, read from the
  panel's own Engine – `metrics/current` (`cpu/ram/disk_usage_percent` -> `*_percent`, 0-100, one decimal) and the
  `system/info` host facts (`cpu_cores`, `memory_total_bytes` -> `ram_total_bytes`, `disk_total_bytes`) and `version`.
  A value the Engine does not answer is `null`; `resource_usage` is left out when none is known and `engine_version`
  when unknown. An Engine that is down never stops the report. The paid product sends neither yet.
- The panel-details additions (Community, 2026-11-19; the Hub team's brief, so a panel's Hub page matches an Engine's), all
  optional to the Hub, which ignores what it does not know yet; each value is `null` when unknown. The paid product
  sends none of them yet (`host` is the optional `Contracts\HubHost`, the app facts and rates are not in its answers):
  - `resource_usage` percentages are the **averages of the last five minutes** (the report's interval): the last five
    one-minute buckets of the Engine's `metrics/history?range=1h`, a bucket without samples left out; a percentage the
    history has none of comes from `metrics/current` as before. `net_in_bps`, `net_out_bps`, `disk_read_bps` and
    `disk_write_bps` are the same averages, in whole bytes per second, under the Engine's own names.
  - `host`: the server, from the Engine's `system/info` – `os`, `kernel`, `uptime_seconds`, `hostname` (the server's
    own name, as `panel.hostname` in §2, `null` when there is none) – and `public_ipv4` (`host.ipv4`, else
    `default_ipv4`). Left out when the Engine names none of it.
  - `apps.*.id`: the app's Client Area id (`applications.id`, SQLite `AUTOINCREMENT`, so never reused), the one
    in `/projects/{id}`, in the events (§6a) and in a login ticket's `target.app` (§8). `domain` is the domain the
    Client Area shows, `created_at` when the project was created (the Engine's time, else the panel's request).
  - The Engine facts of an app come from the mirror's copy of `projects/all`, refreshed every minute, and only while
    that copy is at most five minutes old (an Engine that is down sends no stale usage or health): `framework`
    (`app.label`, else `app.framework`), `healthy` (`details.health_healthy`: the Engine's last health check, after
    each deploy and every six hours), `allocation` (`config.cpu_limit` CPUs, `memory_limit` and `disk_space_limit`
    MB in bytes, `null` = no limit of its own), `usage` (the project's last sample; `cpu_percent` is a share of
    **one** core) and `disk` (measured by the Engine every 15 minutes: `bytes` = `total_bytes`, `files_bytes`,
    `docker_bytes` – the Engine's split, not the brief's `database_bytes` – and `measured_at`).
  - `containers`: each container's latest sample (`projects/{u}/containers/metrics`), only for a running container
    project with fresh facts, at most 50 such reads per report; the only per-app Engine calls of the report.
  - `HubClient` keeps every app item within the Hub's 4 KB (its own measure: PHP's default JSON): it drops
    `containers`, then `disk`, `usage`, `allocation` and `framework` until the item fits, so one large app never
    makes the Hub refuse the whole report.
- `admin_url` is the panel's current admin origin (`HubPanel::adminUrl()`: Community's Application URL, else `APP_URL`; the
  paid Admin Area URL), so the Hub follows a panel that moved – a Settings URL change or the Engine renaming its domain
  (2026-11-07; before, it was the origin stored at pairing time, which went stale). The stored origin is sent only when
  the panel names none. `admin_sso_supported` is `true`: both products accept Hub login tickets (`POST /api/hub-login`,
  `POST /api/admin/hub-login`, contract 2.3).

**Answers**

- `2xx`: accepted.
- `401`: the Hub does not know this pairing (revoked, or a bad signature). The panel **forgets the pairing** (deletes
  all six `hub.*` settings) and stops reporting. If this is the answer to the first report, the wizard shows the
  connection as a failure on step 1; during the Connect setup nothing is kept (no admin, no pairing).
- Any other non-2xx: logged as a warning with the status and the `error` code only, never the body, the secret or the
  signature. The pairing is kept and the next run retries.

## 6a. Monitoring events (2026-11-19, Community)

`POST {hub}/api/panel/v1/events`, signed like the report (§6, path `api/panel/v1/events`), body
`{"events": [...]}` with at most 200 events:

```json
{ "event_type": "app_down", "app_id": "12", "app_name": "shop", "reason": "The app is not running.", "occurred_at": "2026-11-19T09:12:30Z" }
```

- The panel records an event in its `hub_events` table (`PanelAlpha\Hub\HubEvents`, migration in `panelalpha/hub`)
  only while paired, with the pairing's `server_id`; `hub:events` sends them every minute (`onOneServer()`,
  `withoutOverlapping()`), oldest first, at most five batches a run. A sent batch is deleted. An event of an earlier
  pairing is deleted, never sent to the next one. While the Hub cannot be reached at most the newest 1000 wait.
- `occurred_at` is when it happened (ISO 8601 UTC), so a buffered event keeps its own time. `app_id` is the report's
  `apps.*.id`, `app_name` its `name`. `reason` is one plain sentence the customer sees (whitespace squished, at most
  1024 characters); the panel only sends its own fixed sentences, never an Engine message.
- Only the types the Hub accepts (`MonitoringEventType`): `app_down`, `app_up`, `app_install_started`,
  `app_install_succeeded`, `app_install_failed`, `app_removed`, `backup_succeeded`, `backup_failed`. Never
  `server_down` / `server_up`: the Hub records those itself from missed reports.
- Answers: `2xx` sent; `401` the pairing is forgotten (and its events with it); `422` the Hub refused the batch, which
  is dropped and logged (the count only) so it cannot hold back the events after it; anything else, or no answer,
  keeps the batch for the next run (logged with the status and `error` code only).
- What Community records (`community` package):
  - After every sync of the Engine (each minute, `EngineProjectsSynced`) the apps are compared with the previous
    sync: `app_down` when an app's container is not running (`app.status` `down`) or its last health check failed
    (`live` with `health_healthy` false), `app_up` when it runs again and that check did not fail; a building, never
    deployed or suspended app keeps its last state. `app_removed` when an app left the panel (deleted here or on the
    Engine). The first sync after pairing only sets the baseline; a project still being created (`pending`) is not
    an app yet, so a create the Engine rolled back is no removal.
  - An install ends with the Client Area's `user.instance.installation_finished` / `_failed` (a deploy at
    onboarding, a WordPress install or import, a copy): `app_install_succeeded` / `app_install_failed`. Its
    `app_install_started` goes with the outcome, timed at `panel_created_at`, once per app and only for a project the
    panel created in the last day. A project created without a following install sends no install events.
  - A manual backup ends with `user.instance.backup.create_finished` / `_failed`: `backup_succeeded` /
    `backup_failed`. The Engine's scheduled backups are not followed by the panel, so they send none.

## 7. What the panel stores

Settings (`settings` table in Community, `system_settings` in the paid product, where a forgotten value is stored empty;
`Contracts\HubSettings`): `hub.server_id`, `hub.server_secret` (encrypted with the app key), `hub.hub_url`,
`hub.account_name`, `hub.connected_at`, `hub.admin_url`. The panel counts as paired when `hub.server_id` and
`hub.server_secret` are both non-empty. Forgetting the pairing deletes all six. The panel does not store `user`
(§3): only the setup admin's user row carries it.

## 8. Login with a Hub ticket (2026-10-15)

Both products accept the Hub's login tickets (`PANEL-LOGIN-CONTRACT.md` 2.1-2.3; kept for Free and
Pro, not Multi). The paid Admin Area's `POST /api/admin/hub-login` signs in the panel's main account only – the oldest
active admin with full access – only with the plan's `admin_hub_login`. No setting or command chooses another admin:
the old panel's `hub-login-admin-id`, `hub:login-admin` and `PUT /api/admin/settings/hub/login-admin` are gone (since
2026-11-07), and only that main account may connect, re-pair or disconnect the
panel: `/api/admin/configurator/hub{, /start, /complete, /cancel}` and `POST /api/admin/settings/hub/{start, complete,
cancel, disconnect}` answer 403 to any other admin, whatever its permissions. Community:

- `GET /api/hub-login/start` (guest; 404 unless paired and single-user): keeps a 32-character `state` in the visitor's
  session for 10 minutes and answers `{url: "<hub_url>/panel-login?panel=<server_id>&state=<state>[&provider=google]"}`.
- The Hub sends the browser to `<admin_url>/hub-login#ticket=<jwt>`; the Client Area posts `POST /api/hub-login
  {ticket}`. The ticket is HS256 over `{iss: hub_url, aud: server_id, sub: <Hub user id>, email, name, jti, iat, exp, state?}` with
  the `server_secret` (`PanelAlpha\Hub\HubLoginTicket`, shared with the paid Admin Area); `exp`
  and `iat` allow 30 s, `exp - iat` may be at most 300 s (`lifetime`), a `jti` is accepted once and remembered for 5
  minutes or until the ticket expires, whichever is later, and `state` must equal the session's when the panel
  started the login (and be absent when the Hub did). `sub` must be a non-empty string and `email` a valid address; the
  ticket the Hub signed before 2026-10-28 (`sub: "main_admin"` with `by`) is refused.
- When the pairing names its Hub user (`hub.user_id`, §3), `sub` must equal it (`sub_not_paired_user`): a ticket the
  Hub issues to anyone else for this server (a team member, a support session) is refused. Free offers the Hub login
  (`app.hub_login`, `/start`, `POST /api/hub-login`) only for such a pairing; a pairing stored before 2026-11-17 has no
  `hub.user_id` and offers none until it is connected again. The paid Admin Area stores no id yet, so its tickets are
  checked as before.
- "Open in panel" on one app (2026-11-19, Community): a ticket may carry `target: {"app": "<id>"}`,
  the report's `apps.*.id`. After the login the answer is `{"success": true, "redirect": "/projects/<id>"}`, the
  Client Area going there instead of the dashboard. The id is looked up in the panel's own mirror (no Engine call);
  only the id found there makes the path. An unknown id, anything but a plain decimal id, or no `target` answers
  `{"success": true}` as before.
- A valid ticket signs in the panel's only user (its main account), **without 2FA** (the Hub's sign-in is the check), regenerates the
  session and logs `user.login_from_hub`. The session is not password-confirmed, so the 2FA routes answer 423 until
  the owner signs in with the password. Every failure is the same 422 "This login link is not valid any
  more. Log in again from PanelAlpha.". Both routes share the old `hub-login` limit (30 a minute per route and IP).

## 9. Disconnect (2026-10-15)

`php artisan hub:disconnect` (the operator, both products), Community's Settings → PanelAlpha Connect
(`POST /api/community/hub/disconnect`, refused with 409 while the signed-in user's password is generated) and the paid
Admin Area's `POST /api/admin/settings/hub/disconnect` (`panelalpha/hub`'s `HubDisconnection`): when paired, the
panel sends the signed `POST /api/panel/v1/disconnect` (empty JSON object, the §6 headers) and forgets the pairing
whatever the answer (an unreachable Hub is logged). From then on tickets are refused; connecting again is Settings →
PanelAlpha Connect (Community) or the Admin Area's Hub settings (paid).

## 10. Credential for PanelAlpha Go (2026-11-17)

The onboarding's PanelAlpha Go source reads PanelAlpha Go's catalog API (`{go}/api/catalog/v1`, `go` = `hub.go_url` =
`GO_API_BASE`, default `https://go.panelalpha.com`; contract in panelalpha-go `docs/operating-go/catalog-api.md`). The
panel never has its own Go credentials: it asks the Hub for a short-lived token.

`POST {hub}/api/panel/v1/credential` (signed as §6)

```json
{"purpose": "go"}
```

The Hub answers `{"token": "<EdDSA JWT>", "expires_at": "<ISO 8601>"}` (an hour; `sub` the account, `conn` this
pairing, `plan` free or paid). `HubClient::credential()` sends it, `Go\GoToken` keeps the token encrypted in the
server cache until five minutes before `expires_at` and never hands it to the browser, and `Go\GoCatalog` sends it as
`Authorization: Bearer` to Go (10 s timeout, no redirects). A Go 401 drops the kept token and retries once with a new
one. A Hub 401 forgets the pairing, as the report does; any other failure (or no answer) is "catalog unavailable" and
never breaks the onboarding. Community serves the catalog to the Client Area at `/api/community/go{, /apps, /search, /categories,
/apps/{slug}}` (signed in; not paired → 409 `hub_not_connected`, Go or Hub down → 503 `go_unavailable`, Go's 404 and
429 passed on). An app is installed through the usual git onboarding (`POST /projects/deploy`) with the `install.git_repo`
and `install.git_branch` of `/apps/{slug}`, read when the app's details open.
