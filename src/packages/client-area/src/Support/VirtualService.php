<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * The one synthetic "service" a single-server panel presents (Community: one user,
 * one Engine). The Client Area expects services with hosting accounts and
 * calls `/services/{id}/…`; there is no service table yet, so every panel
 * resource shares this constant id and the project payload points at it
 * (`service_id`).
 *
 * Multi-server editions with real services replace this with their own ids.
 */
final class VirtualService
{
    public const ID = 1;

    public const PLAN_NAME = 'Default';
}
