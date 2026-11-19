<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Cache\RateLimiter as RateLimiterService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Container\Container;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\RegisterProviders;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use PanelAlpha\ClientArea\Access\SingleOwnerApplicationRepository;
use PanelAlpha\ClientArea\Access\SingleUserAccessResolver;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Access\SingleUserModeException;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\SingleEngineResolver;
use PanelAlpha\ClientArea\Provisioning\SingleEngineProvisioner;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Community answers to the four edition questions are the controller's own defaults, bound with `bindIf()` and the
 * singleton lifetime the removed `panelalpha/edition-free` package gave them.
 * An edition package that binds a contract with `singleton()` replaces the
 * default whatever the provider order: registered before the controller (the
 * controller's `bindIf()` then keeps it) or after it (its `singleton()`
 * overrides the default).
 *
 * Single-user mode is all or nothing. With every default in
 * place the app is Free; with the three single-user answers replaced (with or
 * without `EngineResolver`) it is a multi-user edition; any other mix fails the
 * boot with a `SingleUserModeException` naming the replaced contracts and the
 * single-user ones still on the default. The Connect
 * AI MCP surface (routes and the `mcp` limiter) is registered in both modes –
 * tokens are per user and scoped to the user's projects.
 *
 * The provider-order and edition cases boot a second, fresh application,
 * because the bindings must be in place while the providers register.
 */
final class SingleUserDefaultsTest extends TestCase
{
    /** The Connect AI MCP routes (routes/mcp.php). */
    private const MCP_ROUTES = [
        'mcp.handle',
        'mcp.check',
        'mcp.tokens.index',
        'mcp.tokens.store',
        'mcp.tokens.revoke',
        'mcp.tokens.destroy',
        'mcp.activity_logs.index',
    ];

    /** Contract => the controller's Community default. */
    private const DEFAULTS = [
        EngineResolver::class => SingleEngineResolver::class,
        ApplicationRepository::class => SingleOwnerApplicationRepository::class,
        AccessResolver::class => SingleUserAccessResolver::class,
        ApplicationProvisioner::class => SingleEngineProvisioner::class,
    ];

    public function test_the_controller_binds_the_community_answers_by_default(): void
    {
        foreach (self::DEFAULTS as $contract => $default) {
            $this->assertInstanceOf($default, $this->app->make($contract), $contract);
            $this->assertTrue($this->app->isShared($contract), "{$contract} keeps the singleton lifetime.");
            $this->assertSame($this->app->make($contract), $this->app->make($contract), $contract);
        }
    }

    /**
     * No queued payload, cache entry or session can name a class of the removed
     * package (no job, notification or event holds one; the container resolves
     * them on every boot), so the old names get no alias and stay unloadable.
     */
    public function test_no_old_edition_free_name_resolves(): void
    {
        foreach ([
            'PanelAlpha\\Edition\\Free\\FreeEditionServiceProvider',
            // The Community package's name until 2026-11-19.
            'PanelAlpha\\EditionFree\\EditionFreeServiceProvider',
            'PanelAlpha\\Edition\\Free\\SingleOwnerApplicationRepository',
            'PanelAlpha\\Edition\\Free\\SingleUserAccessResolver',
            'PanelAlpha\\Edition\\Free\\SingleEngineProvisioner',
            'PanelAlpha\\Edition\\Free\\Http\\Controllers\\Mcp\\McpProxyController',
        ] as $old) {
            $this->assertFalse(class_exists($old), "{$old} must not resolve.");
        }
    }

    /**
     * @return array<string, array{string}>
     */
    public static function providerOrders(): array
    {
        return [
            'the edition provider registers first' => ['first'],
            'the edition provider registers last' => ['last'],
        ];
    }

    #[DataProvider('providerOrders')]
    public function test_an_edition_singleton_replaces_every_default_whatever_the_provider_order(string $order): void
    {
        $doubles = $this->editionDoubles(array_keys(self::DEFAULTS));

        $app = $this->bootWithEdition($doubles, $order);

        foreach ($doubles as $contract => $double) {
            $this->assertSame($double, $app->make($contract), $contract);
        }
    }

    public function test_the_default_boot_is_single_user_with_the_mcp_surface(): void
    {
        $this->assertTrue(SingleUserMode::active($this->app));
        foreach (self::MCP_ROUTES as $name) {
            $this->assertTrue(Route::has($name), "Free must register {$name}.");
        }
        $this->assertNotNull(RateLimiter::limiter('mcp'));
    }

    /**
     * @return array<string, array{list<class-string>, string}>
     */
    public static function multiUserEditions(): array
    {
        $three = [ApplicationRepository::class, AccessResolver::class, ApplicationProvisioner::class];
        $four = [EngineResolver::class, ...$three];

        $cases = [];
        foreach (['first', 'last'] as $order) {
            $cases["the three single-user answers, registered {$order}"] = [$three, $order];
            $cases["all four contracts, registered {$order}"] = [$four, $order];
        }

        return $cases;
    }

    /**
     * @param  list<class-string>  $contracts
     */
    #[DataProvider('multiUserEditions')]
    public function test_a_multi_user_edition_boots_with_the_mcp_surface(array $contracts, string $order): void
    {
        $app = $this->bootWithEdition($this->editionDoubles($contracts), $order);

        $this->assertFalse(SingleUserMode::active($app));
        // Connect AI works per user in every edition.
        foreach (self::MCP_ROUTES as $name) {
            $this->assertTrue($app['router']->has($name), "A multi-user edition must register {$name}.");
        }
        $this->assertNotNull($app->make(RateLimiterService::class)->limiter('mcp'));
        // The rest of the Client Area still registers.
        $this->assertTrue($app['router']->has('client-area.projects.index'));
    }

    /**
     * One case per contract replaced alone, plus a pair: the replaced contracts
     * and the single-user ones still on the default.
     *
     * @return array<string, array{list<class-string>, list<class-string>}>
     */
    public static function partialReplacements(): array
    {
        return [
            'only EngineResolver' => [
                [EngineResolver::class],
                [ApplicationRepository::class, AccessResolver::class, ApplicationProvisioner::class],
            ],
            'only ApplicationRepository' => [
                [ApplicationRepository::class],
                [AccessResolver::class, ApplicationProvisioner::class],
            ],
            'only AccessResolver' => [
                [AccessResolver::class],
                [ApplicationRepository::class, ApplicationProvisioner::class],
            ],
            'only ApplicationProvisioner' => [
                [ApplicationProvisioner::class],
                [ApplicationRepository::class, AccessResolver::class],
            ],
            'ApplicationRepository and AccessResolver' => [
                [ApplicationRepository::class, AccessResolver::class],
                [ApplicationProvisioner::class],
            ],
        ];
    }

    /**
     * @param  list<class-string>  $replaced
     * @param  list<class-string>  $stillDefault
     */
    #[DataProvider('partialReplacements')]
    public function test_a_partial_replacement_fails_the_boot(array $replaced, array $stillDefault): void
    {
        foreach (['first', 'last'] as $order) {
            try {
                $this->bootWithEdition($this->editionDoubles($replaced), $order);
                $this->fail("A partial replacement registered {$order} must fail the boot.");
            } catch (SingleUserModeException $e) {
                $this->assertSame(
                    sprintf(
                        'Single-user mode is all or nothing: %s %s replaced, but %s still %s to the controller\'s '
                        .'single-user defaults. A multi-user edition binds ApplicationRepository, AccessResolver and '
                        .'ApplicationProvisioner with singleton().',
                        implode(', ', $replaced),
                        count($replaced) === 1 ? 'is' : 'are',
                        implode(', ', $stillDefault),
                        count($stillDefault) === 1 ? 'resolves' : 'resolve',
                    ),
                    $e->getMessage(),
                );
            }
        }
    }

    /**
     * One stub per contract, standing in for a Pro/Multi implementation.
     *
     * @param  list<class-string>  $contracts
     * @return array<class-string, object>
     */
    private function editionDoubles(array $contracts): array
    {
        $doubles = [];
        foreach ($contracts as $contract) {
            $doubles[$contract] = $this->createStub($contract);
        }

        return $doubles;
    }

    /**
     * Boot a fresh application with an edition provider that binds the given
     * doubles with `singleton()`, registered before every other provider
     * (`first`) or after all of them (`last`).
     *
     * @param  array<class-string, object>  $bindings
     */
    private function bootWithEdition(array $bindings, string $order): Application
    {
        /** @var Application $app */
        $app = require base_path('bootstrap/app.php');

        $edition = new class($app, $bindings) extends ServiceProvider
        {
            /**
             * @param  array<class-string, object>  $doubles
             */
            public function __construct(Application $app, private readonly array $doubles)
            {
                parent::__construct($app);
            }

            public function register(): void
            {
                foreach ($this->doubles as $contract => $double) {
                    $this->app->singleton($contract, static fn (): object => $double);
                }
            }
        };

        if ($order === 'first') {
            $app->register($edition);
        } else {
            $app->afterBootstrapping(RegisterProviders::class, static fn (Application $app) => $app->register($edition));
        }

        try {
            $app->make(Kernel::class)->bootstrap();
        } finally {
            // Bootstrapping made the fresh app the global container and the
            // facade root; hand both back to this test's application.
            Container::setInstance($this->app);
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->app);
        }

        return $app;
    }
}
