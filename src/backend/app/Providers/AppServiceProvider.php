<?php

namespace App\Providers;

use App\Actions\Users\CreateUser;
use App\Models\Setting;
use App\Support\Atarim;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use App\Support\PanelLanguageList;
use App\Support\EngineServerIpv4Addresses;
use App\Support\HomePayloadForUser;
use App\Support\PanelSettingsStore;
use App\Support\SettingsPanelUrl;
use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use PanelAlpha\ClientArea\Contracts\ClientAreaHome;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelLanguages;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The one Engine of this single-engine panel; credentials are set with
        // `php artisan settings:set engine-api-url|engine-api-token` and the
        // pinned CA certificate with `settings:set engine-api-ca`.
        $this->app->bind(EngineConnection::class, function () {
            $url = rtrim((string) Setting::get('engine-api-url'), '/');
            $token = (string) Setting::get('engine-api-token');
            $ca = Setting::get('engine-api-ca');

            if ($url === '' || $token === '') {
                throw new EngineNotConfiguredException(
                    'Engine connection is not configured. Set engine-api-url and engine-api-token via settings:set.',
                );
            }

            return new EngineConnection(
                EngineConnection::DEFAULT_ID,
                $url,
                $token,
                $ca !== null && trim($ca) !== '' ? $ca : null,
                timeout: Payload::int(config('client-area.engine_timeout', 30)),
            );
        });

        // The Atarim settings the controller's collaboration link needs. They
        // live in the `settings` table, so the host binds them like the Engine
        // connection; `bind`, not `singleton`, so a changed setting is read on
        // the next resolution.
        $this->app->bind(AtarimSettings::class, fn (): AtarimSettings => new AtarimSettings(
            enabled: Atarim::isEnabled(),
            referralLink: Atarim::referralLink(),
        ));

        // The settings table and the language list for packages that read or
        // change them (the paid Admin Area; the
        // Community settings and Hub pairing, community).
        $this->app->bind(PanelSettings::class, PanelSettingsStore::class);
        $this->app->bind(PanelLanguages::class, PanelLanguageList::class);
        // The public origin of generated links: `userapp.url`, else `APP_URL`.
        $this->app->bind(PanelUrl::class, SettingsPanelUrl::class);
        // The server's IPv4 list for a project with none of its own: the cached
        // Engine system info, Community panel only. `scoped`: read once per request.
        $this->app->scoped(ServerIpv4Addresses::class, EngineServerIpv4Addresses::class);

        // User creation shared by `users:create` and the Community first-run wizard
        // (community, installed only in the Community deployment). `bind`,
        // not `singleton`, so a write is never hidden behind a stale instance.
        $this->app->bind(FirstUserCreator::class, CreateUser::class);
        // The `/home` payload a package answers after signing a user in (the
        // paid sign-up).
        $this->app->bind(ClientAreaHome::class, HomePayloadForUser::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The single panel-user password policy. `uncompromised()`
        // calls the external HIBP API, so it is opt-in (never in tests).
        Password::defaults(fn (): Password => Password::min(8)
            ->max(255)
            ->letters()
            ->mixedCase()
            ->numbers()
            ->symbols()
            ->when(
                (bool) config('auth.password_uncompromised'),
                fn (Password $rule): Password => $rule->uncompromised(),
            ));

        // The `engine-mcp-url` setting overrides the
        // MCP endpoint derived from `engine-api-url`. A fresh checkout boot (the
        // test suite, `php artisan` before the migration) has no settings table
        // yet, so the lookup is best-effort.
        try {
            if (Schema::hasTable('settings')) {
                $mcpUrl = Setting::get('engine-mcp-url');
                if ($mcpUrl !== null && $mcpUrl !== '') {
                    config(['client-area.mcp_url' => $mcpUrl]);
                }
            }
        } catch (\Throwable) {
            // The database is not ready yet; the setting is read on the next request.
        }
    }
}
