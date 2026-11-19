<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The `admin` block of the Client Area's `/home` (old AuthController::home(),
 * packages/api/app/Http/Controllers/AuthController.php:943-956): present when
 * an admin is signed in to this Client Area session ("login as user"), so the
 * CA shows its way back to the Admin Area. Community has no admin: the
 * controller's default answers null; the paid Admin Area binds its own.
 */
interface HomeAdminBlock
{
    /**
     * `{email, gravatar_hash, app_url, api_url}`, or null without an admin.
     *
     * @return array<string, mixed>|null
     */
    public function forCurrentSession(): ?array;
}
