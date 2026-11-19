<?php

return [

    /*
    | Seconds a synced Engine project list stays fresh. Repositories call
    | ApplicationSynchronizer::syncIfStale() on read; within this window the
    | local applications table is served without calling the Engine.
    */
    'sync_ttl' => (int) env('USER_APPLICATION_SYNC_TTL', 15),

    /*
    | The panel's own Engine project (the Engine username). The sync skips it
    | and every route bound to it answers 404, so the panel never manages itself.
    | An optional override (`PANELALPHA_SELF_PROJECT`): blank/null asks the
    | Engine instead (`SelfProject`). Read it through `SelfProject` only.
    */
    'self_project' => env('PANELALPHA_SELF_PROJECT'),

    /*
    | MCP server URL override. Empty means the panel
    | derives the endpoint from `engine-api-url`'s origin plus the Engine's `/mcp`
    | path; a set value is used verbatim. The host app maps the `engine-mcp-url`
    | setting onto this key.
    */
    'mcp_url' => env('PANELALPHA_MCP_URL'),

    /*
    | Middleware for the package's Client Area routes (mounted under /api).
    | `activity` records successful mutating requests.
    */
    'route_middleware' => ['api', 'auth', 'activity'],


    /*
    | Timeout (seconds) for Engine HTTP calls made through EngineClient.
    */
    'engine_timeout' => (int) env('ENGINE_HTTP_TIMEOUT', 30),

    /*
    | The host's users table panel tables reference. Pro and
    | Multi bind the same User model, so the package must not hard-code `users`.
    */
    'users_table' => env('USER_APPLICATION_USERS_TABLE', 'users'),

    /*
    | Filesystem disk the project website screenshots are stored on.
    | Private by default – the CA reads them through the authorised
    | `/instances/{id}/screenshot.jpg` route, never the disk directly.
    */
    'screenshot_disk' => env('USER_APPLICATION_SCREENSHOT_DISK', 'local'),

    /*
    | File-manager upload limit, in bytes. The `fm` SPA compares the byte size
    | it is told here (its own default is 1 GiB); it must stay under the
    | container's upload_max_filesize/post_max_size.
    */
    'upload_max_bytes' => (int) env('USER_APPLICATION_UPLOAD_MAX_BYTES', 268435456),

    /*
    | Glob patterns a subdomain label used in the domain-change step may not
    | match (`Str::is` rules, the old plan subdomains
    | blacklist). Empty in the single-server edition.
    |
    | @var list<string>
    */
    'subdomains_blacklist' => [],

    /*
    | Days an `activity_logs` row is kept; the
    | controller's `prune-client-area-tables` schedule entry prunes older rows.
    | Moved from client-area-legacy with the activity log; the
    | env name keeps its `USER_APPLICATION_*` spelling.
    */
    'activity_retention_days' => (int) env('USER_APPLICATION_ACTIVITY_RETENTION_DAYS', 90),

    /*
    | Days a `git_operations` row is kept; the
    | controller's `prune-client-area-tables` schedule entry prunes older rows.
    | Moved from client-area-legacy with the git operation log;
    | the env name keeps its `USER_APPLICATION_*` spelling.
    */
    'git_operation_retention_days' => (int) env('USER_APPLICATION_GIT_OPERATION_RETENTION_DAYS', 30),

];
