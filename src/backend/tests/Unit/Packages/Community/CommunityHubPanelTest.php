<?php

namespace Tests\Unit\Packages\Community;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use LogicException;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\Community\Hub\CommunityHubPanel;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\Hub\Contracts\HubPanel;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * What the Community panel tells the Hub: product, version, address, host name, IP,
 * and the mirrored applications.
 */
final class CommunityHubPanelTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->configureEngine();
        config(['community.panel_version' => 'v1.9.4']);
    }

    /**
     * @param  list<Application>  $apps
     */
    private function panel(array $apps = [], string $base = 'https://panel.example.com/admin'): CommunityHubPanel
    {
        $repository = new class($apps) implements ApplicationRepository
        {
            /** @param list<Application> $apps */
            public function __construct(private readonly array $apps) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection($this->apps);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                throw new LogicException('not used');
            }

            public function domainsInUse(): array
            {
                return [];
            }
        };
        $url = new class($base) implements PanelUrl
        {
            public function __construct(private readonly string $base) {}

            public function base(): string
            {
                return $this->base;
            }

            public function stored(): ?string
            {
                return null;
            }
        };

        return new CommunityHubPanel(app(EngineResolver::class), $repository, $url);
    }

    private function application(string $name, string $username = 'user1', string $domain = 'a.example.com', string $type = 'wordpress', string $status = 'active'): Application
    {
        return new Application(['name' => $name, 'engine_username' => $username, 'domain' => $domain, 'type' => $type, 'status' => $status]);
    }

    public function test_the_product_the_version_and_the_licence_are_fixed_for_free(): void
    {
        $panel = $this->panel();

        $this->assertSame(HubPanel::COMMUNITY, $panel->product());
        $this->assertSame('v1.9.4', $panel->version());
        $this->assertNull($panel->licenseKey());
    }

    public function test_the_admin_url_is_the_origin_of_the_panel_address(): void
    {
        $this->assertSame('https://panel.example.com', $this->panel()->adminUrl());
        $this->assertSame('http://panel.example.com:9080', $this->panel(base: 'http://panel.example.com:9080/')->adminUrl());
    }

    public function test_the_host_name_and_the_ip_come_from_the_engine_system_info(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:64
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => ['default_ipv4' => TestNetwork::public(7), 'host' => ['hostname' => 'box.example.com']]])]);
        $panel = $this->panel();

        $this->assertSame('box.example.com', $panel->hostname('https://panel.example.com'));
        $this->assertSame(TestNetwork::public(7), $panel->ip());
        Http::assertSentCount(1);
    }

    public function test_the_engine_container_s_own_name_gives_way_to_the_server_s_certified_name(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:56 (cert_domain); the host name comes from the Docker daemon
        Http::fake(['engine.example.com/api/system/info' => Http::sequence()
            ->push(['data' => ['cert_domain' => 'srv1.example.com', 'host' => ['hostname' => 'engine']]])
            ->push(['data' => ['cert_domain' => null, 'host' => ['hostname' => 'engine']]])
            ->push(['data' => ['cert_domain' => null, 'host' => ['hostname' => 'srv1']]])]);

        $this->assertSame('srv1.example.com', $this->panel()->hostname('https://panel.example.com'));
        $this->assertSame('panel.example.com', $this->panel()->hostname('https://panel.example.com'));
        // A bare name that is not the Engine container's is still the server's best name.
        $this->assertSame('srv1', $this->panel()->host()['hostname'] ?? null);
    }

    public function test_the_host_name_falls_back_to_the_host_of_the_admin_url(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:64
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => ['default_ipv4' => null, 'host' => []]])]);
        $panel = $this->panel();

        $this->assertSame('panel.example.com', $panel->hostname('https://panel.example.com:8443/x'));
        $this->assertSame('', $panel->ip());
    }

    public function test_an_engine_that_is_down_gives_the_fallbacks_and_is_asked_once(): void
    {
        // Engine: core/app/Exceptions/Handler.php:106
        Http::fake(['engine.example.com/api/system/info' => Http::response(['message' => 'down'], 502)]);
        $panel = $this->panel();

        $this->assertSame('panel.example.com', $panel->hostname('https://panel.example.com'));
        $this->assertSame('', $panel->ip());
        Http::assertSentCount(1);
    }

    public function test_without_a_user_there_are_no_apps(): void
    {
        $this->assertSame([], $this->panel([$this->application('blog')])->apps());
    }

    public function test_a_user_model_that_is_not_an_authenticatable_model_gives_no_apps(): void
    {
        config(['auth.providers.users.model' => \stdClass::class]);

        $this->assertSame([], $this->panel([$this->application('blog')])->apps());
    }

    public function test_the_apps_carry_the_name_the_type_the_status_the_address_and_the_domain(): void
    {
        User::factory()->create();

        $apps = $this->panel([
            $this->application('Blog', domain: 'blog.example.com', type: 'wordpress', status: 'active'),
            $this->application('Shop', username: 'user2', domain: 'shop.example.com', type: 'laravel', status: 'stopped'),
        ])->apps();

        $this->assertSame([
            ['name' => 'Blog', 'type' => 'wordpress', 'status' => 'active', 'public_url' => 'https://blog.example.com', 'domain' => 'blog.example.com', 'created_at' => null],
            ['name' => 'Shop', 'type' => 'laravel', 'status' => 'stopped', 'public_url' => 'https://shop.example.com', 'domain' => 'shop.example.com', 'created_at' => null],
        ], $apps);
    }

    public function test_an_app_without_a_domain_is_reported_without_an_address(): void
    {
        User::factory()->create();

        $apps = $this->panel([$this->application('Blog', domain: '')])->apps();

        $this->assertSame([['name' => 'Blog', 'type' => 'wordpress', 'status' => 'active', 'domain' => null, 'created_at' => null]], $apps);
    }

    public function test_an_app_without_a_name_is_named_by_its_username_then_its_domain_and_never_empty(): void
    {
        User::factory()->create();

        $apps = $this->panel([
            $this->application('', username: 'user1'),
            $this->application('', username: '', domain: 'only.example.com'),
            $this->application('', username: '', domain: ''),
        ])->apps();

        $this->assertSame(['user1', 'only.example.com'], array_column($apps, 'name'));
    }

    public function test_at_most_five_hundred_apps_are_reported(): void
    {
        User::factory()->create();
        $many = [];
        for ($i = 1; $i <= 520; $i++) {
            $many[] = $this->application('app'.$i, username: 'u'.$i);
        }

        $apps = $this->panel($many)->apps();

        $this->assertCount(500, $apps);
        $this->assertSame('app500', $apps[499]['name']);
    }
}
