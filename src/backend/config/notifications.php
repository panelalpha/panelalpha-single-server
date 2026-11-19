<?php

return [

    /*
    | Retention of the host's `notifications` table, the
    | Client Area bell: rows older than this many days are pruned by the
    | scheduler (`prune-panel-tables`). Host config (it used to
    | be one of the legacy package's retention keys); the env name keeps its pre-split
    | `USER_APPLICATION_*` spelling, which operators already set.
    */
    'retention_days' => (int) env('USER_APPLICATION_NOTIFICATIONS_RETENTION_DAYS', 90),

];
