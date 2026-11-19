<?php

namespace Tests\Feature;

use App\Http\Middleware\AddPanelUrlToStatefulDomains;
use App\Models\Setting;
use App\Support\SettingsPanelUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * The panel's public origin: `userapp.url` when saved, else `APP_URL`, and the
 * Sanctum host that follows it.
 */
class PanelUrlTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_host_binds_the_settings_backed_resolver(): void
    {
        $this->assertInstanceOf(SettingsPanelUrl::class, app(PanelUrl::class));
    }

    public function test_base_falls_back_to_app_url_when_nothing_is_stored(): void
    {
        config(['app.url' => 'https://panel.example.test/']);

        $url = app(PanelUrl::class);

        $this->assertNull($url->stored());
        $this->assertSame('https://panel.example.test', $url->base());
    }

    public function test_base_is_the_stored_origin(): void
    {
        config(['app.url' => 'https://panel.example.test']);
        Setting::set('userapp.url', 'https://new.example.com:8443');

        $url = app(PanelUrl::class);

        $this->assertSame('https://new.example.com:8443', $url->stored());
        $this->assertSame('https://new.example.com:8443', $url->base());
    }

    public function test_an_empty_stored_value_falls_back_to_app_url(): void
    {
        config(['app.url' => 'https://panel.example.test']);
        Setting::set('userapp.url', '');

        $this->assertNull(app(PanelUrl::class)->stored());
        $this->assertSame('https://panel.example.test', app(PanelUrl::class)->base());
    }

    public function test_a_changed_setting_shows_on_the_next_resolution(): void
    {
        Setting::set('userapp.url', 'https://one.example.com');
        $this->assertSame('https://one.example.com', app(PanelUrl::class)->base());

        Setting::set('userapp.url', 'https://two.example.com');
        $this->assertSame('https://two.example.com', app(PanelUrl::class)->base());
    }

    /**
     * @return list<string>
     */
    private function statefulAfter(): array
    {
        $middleware = app(AddPanelUrlToStatefulDomains::class);
        $middleware->handle(Request::create('/api/home'), fn (): Response => new Response);

        /** @var list<string> */
        return config('sanctum.stateful');
    }

    public function test_the_middleware_appends_the_stored_host(): void
    {
        config(['sanctum.stateful' => ['localhost']]);
        Setting::set('userapp.url', 'https://new.example.com');

        $this->assertSame(['localhost', 'new.example.com'], $this->statefulAfter());
    }

    public function test_the_middleware_appends_host_and_port(): void
    {
        config(['sanctum.stateful' => ['localhost']]);
        Setting::set('userapp.url', 'https://new.example.com:8443');

        $this->assertSame(['localhost', 'new.example.com:8443'], $this->statefulAfter());
    }

    public function test_the_middleware_does_not_repeat_a_host_that_is_already_listed(): void
    {
        config(['sanctum.stateful' => ['localhost', 'new.example.com']]);
        Setting::set('userapp.url', 'https://new.example.com');

        $this->assertSame(['localhost', 'new.example.com'], $this->statefulAfter());
    }

    public function test_the_middleware_changes_nothing_when_no_url_is_stored(): void
    {
        config(['sanctum.stateful' => ['localhost']]);

        $this->assertSame(['localhost'], $this->statefulAfter());

        Setting::set('userapp.url', '');
        $this->assertSame(['localhost'], $this->statefulAfter());
    }
}
