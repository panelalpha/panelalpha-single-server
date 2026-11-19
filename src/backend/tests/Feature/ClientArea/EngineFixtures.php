<?php

namespace Tests\Feature\ClientArea;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\ClientArea\Support\SelfProject;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineFeatures;
use Tests\Support\TestNetwork;

/**
 * Engine API fixtures shared by the ClientArea tests.
 */
trait EngineFixtures
{
    protected const ENGINE = 'https://engine.example.com/api';

    protected function configureEngine(): void
    {
        Setting::set('engine-api-url', self::ENGINE);
        Setting::set('engine-api-token', '1|test-token');

        // An Engine 2.2.0 by default: no API features, so every call stays the
        // flat one and `system/info` is not read. TypedProjectSourceTest
        // fakes an Engine 2.3.0.
        EngineFeatures::remember(app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID), []);
        $this->rememberNoSelfProject();
    }

    /**
     * The Engine names no project for the panel's token, so the panel's own project is only what
     * `client-area.self_project` says and no read asks the Engine. SelfProjectTest asks it.
     */
    protected function rememberNoSelfProject(?EngineClient $engine = null): void
    {
        SelfProject::remember($engine ?? app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID), null);
    }

    /**
     * One item of `GET E:/projects/{u}/deploys` (Engine
     * `53c9a6ff4`): a kept deploy with its id (`Ymd-His-<6 hex>`), status,
     * unix times, kind, source, branch, commit, trigger, action and task id.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function engineDeploy(array $overrides = []): array
    {
        // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:91-101 -> entry
        return array_merge([
            'id' => '20261014-101500-a1b2c3',
            'status' => 'success',
            'error' => null,
            'started_at' => 1791972900,
            'finished_at' => 1791973000,
            'kind' => 'redeploy',
            'source' => 'git',
            'branch' => 'main',
            'commit' => '3f2c9e1d4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
            'trigger' => 'api',
            'action' => 'git_pull',
            'task_id' => 41,
        ], $overrides);
    }

    /**
     * Fake `GET E:/projects/{u}/deploys`: the install state of a
     * project whose install has not succeeded and the git-onboarding check read
     * it. Register it before any other fake of the same path – the first
     * matching fake answers.
     *
     * @param  list<array<string, mixed>>  $items
     */
    protected function fakeEngineDeploys(string $username, array $items = []): void
    {
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        Http::fake(["engine.example.com/api/projects/{$username}/deploys" => Http::response(['data' => $items])]);
    }

    /**
     * Fake `GET E:/projects/{u}/wp/core`, which the WordPress reads that need
     * the database check first. An `installed` core unless `$overrides` names
     * another state (`no_core`, `no_config`, `db_unreachable`).
     *
     * @param  array<string, mixed>  $overrides
     */
    protected function fakeEngineWordPressCore(string $username, array $overrides = []): void
    {
        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
        Http::fake(["engine.example.com/api/projects/{$username}/wp/core?*" => Http::response(['data' => array_merge([
            'installed' => true,
            'version' => '7.1.4',
            'state' => 'installed',
        ], $overrides)])]);
    }

    /**
     * One item of GET /projects/all (Engine UserResource).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function engineProject(int $id, string $username, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'username' => $username,
            'domain' => "{$username}.example.com",
            'name' => ucfirst($username),
            'status' => 'active',
            'staging_of' => null,
            'staging' => null,
            'details' => [],
            'config' => [],
            'created_at' => '2026-01-0'.min($id, 9).'T00:00:00.000000Z',
            'domain_names' => ["{$username}.example.com"],
        ], $overrides);
    }

    /**
     * One `GET E:/usage` body (Engine `ProjectUsage::summary`). The values are
     * the live-run scale: `storage` MB with `-1` unlimited, `bandwidth` bytes.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function engineUsage(array $overrides = []): array
    {
        // Engine: core/app/Http/Controllers/User/UsageController.php:33 -> getUsage, core/app/Lib/Usage/ProjectUsage.php:44 -> summary
        return array_merge([
            'storage' => ['usage' => 91, 'maximum' => -1],
            'logs' => ['usage' => 0, 'maximum' => null],
            'bandwidth' => ['usage' => 27106703, 'maximum' => null],
            'addon_domains' => ['usage' => 1, 'maximum' => null],
            'subdomains' => ['usage' => 2, 'maximum' => null],
            'ftp_accounts' => ['usage' => 1, 'maximum' => null],
            'sftp_accounts' => ['usage' => 0, 'maximum' => null],
            'mysql_databases' => ['usage' => 1, 'maximum' => null],
        ], $overrides);
    }

    /**
     * One Engine `TunnelResource` (`GET|POST E:/domains/{d}/tunnels`): a
     * `preview` tunnel the Engine allocated (`preview-<8>` label,
     * `TunnelManager.php:26-29`) on the main domain of `site1`, with the
     * top-level `purpose` and engine-enforced `valid_until`.
     * Since Engine `f72fec570` a `preview` tunnel is registered with
     * the main domain as its target, kept in `details.target_domain`.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function engineTunnel(array $overrides = []): array
    {
        $hostname = is_string($overrides['hostname'] ?? null) ? $overrides['hostname'] : 'preview-a1b2c3d4.panelalpha.online';

        // Engine: core/app/Http/Resources/TunnelResource.php:17-28 -> toArray (f72fec570; `details` from core/app/Integrations/Tunnels/PanelAlphaConnect.php:318-324 and TunnelManager.php:192-198)
        return array_merge([
            'id' => 7,
            'hostname' => $hostname,
            'provider' => 'panelalpha',
            'purpose' => 'preview',
            'domain' => 'site1.example.com',
            'url' => 'https://'.$hostname.'/',
            'valid_until' => '2030-01-01T00:15:00+00:00',
            'details' => ['purpose' => 'preview', 'expires_at' => '2030-01-01T00:15:00+00:00', 'path' => strstr($hostname, '.', true), 'target_ip' => TestNetwork::public(10), 'target_domain' => 'site1.example.com'],
            'created_at' => '2030-01-01T00:00:00+00:00',
            'updated_at' => '2030-01-01T00:00:00+00:00',
        ], $overrides);
    }

    /**
     * A Connect AI bearer the `/mcp` gatekeeper forwards: a Sanctum
     * plain-text token `<id>|<secret>` whose id the panel recorded for a user
     * (a new one unless given). The Engine checks the secret.
     */
    protected function ownedMcpBearer(int $engineTokenId = 6, ?User $user = null, string $secret = 'pAnelMintedS3cretOf40CharactersXXXXXXXXXX'): string
    {
        McpToken::query()->create([
            'user_id' => ($user ?? User::factory()->create())->id,
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_token_id' => $engineTokenId,
            'name' => 'Claude',
        ]);

        return $engineTokenId.'|'.$secret;
    }

    /**
     * Replace the three single-user answers at runtime with a multi-user
     * edition's: an `ApplicationRepository` that links each user to
     * the given mirrored usernames (`$repository->projects` stays mutable, so a
     * test can link or unlink later), and stub `AccessResolver` /
     * `ApplicationProvisioner`. `SingleUserMode::active()` is false from here on.
     *
     * @param  array<int, list<string>>  $projects  user id => Engine usernames
     */
    protected function bindMultiUserEdition(array $projects): object
    {
        $repository = new class($projects) implements ApplicationRepository
        {
            /** @param array<int, list<string>> $projects */
            public function __construct(public array $projects) {}

            public function forUser(Authenticatable $user, bool $refresh = true): EloquentCollection
            {
                $id = $user->getAuthIdentifier();

                return Application::query()
                    ->whereIn('engine_username', is_int($id) ? ($this->projects[$id] ?? []) : [])
                    ->orderBy('id')
                    ->get();
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->forUser($user, false)->where('id', $id)->firstOrFail();
            }

            public function domainsInUse(): array
            {
                return [];
            }
        };

        $this->app->instance(ApplicationRepository::class, $repository);
        $this->app->instance(AccessResolver::class, $this->createStub(AccessResolver::class));
        $this->app->instance(ApplicationProvisioner::class, $this->createStub(ApplicationProvisioner::class));

        return $repository;
    }

    /**
     * Sync one Engine project into the mirror and return its local row, so a
     * test does not copy the configureEngine/fake/list dance.
     *
     * @param  array<string, mixed>  $project  overrides for the Engine project
     */
    protected function syncedApplication(User $user, string $username = 'site1', array $project = []): Application
    {
        $this->configureEngine();
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, $username, $project),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', $username)->firstOrFail();
    }

    /**
     * The classic project the CA's domain step just created, which is the only
     * project a `POST /projects/install` may target: a synced project that
     * carries the `onboarding_at` marker the domain step sets
     * (`ClassicOnboardingGitAttacher::domainStepCreated`).
     *
     * @param  array<string, mixed>  $project  overrides for the Engine project
     */
    protected function domainStepProject(User $user, string $username = 'site1', array $project = []): Application
    {
        $application = $this->syncedApplication($user, $username, $project);
        $application->forceFill(['onboarding_at' => now()])->save();

        return $application;
    }

    /**
     * Bind an EngineResolver that hands out one EngineClient subclass recording
     * every `withTimeout()` it is asked for, so a test can prove the per-call
     * timeout a long synchronous Engine call passes.
     *
     * @return EngineClient the spy; read `->requestedTimeout`
     */
    protected function spyEngineTimeout(Application $application): EngineClient
    {
        $connection = app(EngineResolver::class)->forEngine($application->engine_id)->connection();

        $spy = new class($connection) extends EngineClient
        {
            public ?int $requestedTimeout = null;

            public function withTimeout(int $seconds): static
            {
                $this->requestedTimeout = $seconds;

                return parent::withTimeout($seconds);
            }
        };

        $this->app->instance(EngineResolver::class, new class($spy) implements EngineResolver
        {
            public function __construct(private readonly EngineClient $client) {}

            public function forEngine(int $engineId): EngineClient
            {
                return $this->client;
            }

            public function defaultEngineId(): int
            {
                return $this->client->connection()->id;
            }

            public function engineIds(): array
            {
                return [$this->client->connection()->id];
            }
        });

        return $spy;
    }

    /**
     * Withhold one or more privileges from the current edition resolver, so a
     * route guarded with `privilege:<name>` answers 403 (Community grants
     * everything).
     */
    protected function denyPrivilege(string ...$privileges): void
    {
        $inner = $this->app->make(AccessResolver::class);
        $denied = $privileges;

        $this->app->instance(AccessResolver::class, new class($inner, $denied) implements AccessResolver
        {
            /**
             * @param  list<string>  $denied
             */
            public function __construct(
                private readonly AccessResolver $inner,
                private readonly array $denied,
            ) {}

            public function privileges(Authenticatable $user, Application $application): array
            {
                return array_values(array_diff($this->inner->privileges($user, $application), $this->denied));
            }

            public function allows(Authenticatable $user, Application $application, string $privilege): bool
            {
                return ! in_array($privilege, $this->denied, true)
                    && $this->inner->allows($user, $application, $privilege);
            }

            public function allowsUser(Authenticatable $user, string $privilege): bool
            {
                return ! in_array($privilege, $this->denied, true) && $this->inner->allowsUser($user, $privilege);
            }

            public function usersFor(Application $application): Collection
            {
                return $this->inner->usersFor($application);
            }
        });
    }

    /**
     * Withhold every privilege – every `privilege:`-guarded route must answer
     * 403 before the controller (and thus before any Engine call).
     */
    protected function denyAllPrivileges(): void
    {
        $this->app->instance(AccessResolver::class, new class implements AccessResolver
        {
            public function privileges(Authenticatable $user, Application $application): array
            {
                return [];
            }

            public function allows(Authenticatable $user, Application $application, string $privilege): bool
            {
                return false;
            }

            public function allowsUser(Authenticatable $user, string $privilege): bool
            {
                return false;
            }

            public function usersFor(Application $application): Collection
            {
                return collect();
            }
        });
    }

    /**
     * Bind a HostResolver that answers without DNS, so a test never touches the
     * network. The fake asserts its host argument: it answers only
     * the Engine host and the hosts in `$addresses`, and fails the test for any
     * other name, so a route cannot silently resolve an unexpected host.
     *
     * @param  array<string, list<string>>  $addresses  host => addresses
     */
    protected function fakeHostResolver(array $addresses = []): void
    {
        // DnsHostGuard resolves the Engine's own host on every call to compare
        // the candidate against it; a caller's host must not share that address
        // or the guard would reject it as the Engine's IP.
        $addresses['engine.example.com'] ??= [TestNetwork::routable(34)];

        $this->app->instance(HostResolver::class, new class($addresses) implements HostResolver
        {
            /** @param array<string, list<string>> $addresses */
            public function __construct(private readonly array $addresses) {}

            public function addresses(string $host): array
            {
                if (! array_key_exists($host, $this->addresses)) {
                    \PHPUnit\Framework\Assert::fail("HostResolver was asked to resolve an unexpected host [{$host}].");
                }

                return $this->addresses[$host];
            }
        });
    }

    /**
     * Bind a PinnedProbe that opens no socket and finds nothing,
     * so the reachability routes answer their `null` shape without HTTP.
     */
    protected function fakePinnedProbe(): void
    {
        $this->app->instance(PinnedProbe::class, new class implements PinnedProbe
        {
            public function httpsStatus(string $host, string $address): ?int
            {
                return null;
            }
        });
    }

    /**
     * An Engine `installed-ssl-cert` answer: `Domain::getSslCertificateInfo()`
     * with the `CertificateStatus::of()` verdict (Engine
     * core/app/System/Project/Domain.php:316, core/app/Lib/Ssl/CertificateStatus.php:73).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function engineSslCertificate(string $domain = 'site1.example.com', array $overrides = []): array
    {
        return array_replace([
            'certificate' => 'CERT-TEXT',
            'cabundle' => 'CA',
            'common_name' => $domain,
            'issuer_name' => "Let's Encrypt",
            'issuer_common_name' => 'R11',
            'not_before' => 1700000000,
            'not_after' => 1800000000,
            'domains' => [$domain],
            'chain_trusted' => true,
            'status' => 'trusted',
            'issuer' => "Let's Encrypt",
            'self_signed' => false,
            'covers_domain' => true,
            'valid_from' => '2023-11-14T22:13:20Z',
            'expires_at' => '2027-01-15T08:00:00Z',
            'days_remaining' => 90,
        ], $overrides);
    }

    /**
     * An Engine `ssl-check` answer (Engine core/app/Lib/Ssl/SslCheck.php:68): the
     * certificate the domain's DNS address presents (`public`), what the
     * project's webserver presents (`engine`) and where DNS points.
     *
     * @param  array<string, mixed>  $certificate  overrides of the public leaf
     * @param  array<string, mixed>  $overrides  overrides of the top level
     * @return array<string, mixed>
     */
    protected function engineSslCheck(string $domain = 'site1.example.com', array $certificate = [], array $overrides = []): array
    {
        $leaf = array_replace([
            'status' => 'trusted',
            'issuer' => "Let's Encrypt",
            'self_signed' => false,
            'chain_trusted' => true,
            'covers_domain' => true,
            'valid_from' => '2026-09-01T00:00:00Z',
            'expires_at' => '2026-11-30T00:00:00Z',
            'days_remaining' => 44,
            'common_name' => $domain,
            'names' => [$domain],
            'signer' => ['common_name' => 'R11', 'organization' => "Let's Encrypt", 'country' => 'US'],
            'serial_number' => '04A1',
            'signature_algorithm' => 'sha256WithRSAEncryption',
            'key' => ['type' => 'EC', 'bits' => 256, 'curve' => 'prime256v1'],
            'fingerprint_sha256' => 'ab12',
            'chain' => [],
        ], $certificate);
        $probe = ['address' => TestNetwork::public(10), 'answered' => true, 'refused' => false, 'error' => null, 'certificate' => $leaf];

        return array_replace([
            'domain' => $domain,
            'status' => $leaf['status'],
            'checked_at' => '2026-10-16T12:00:00Z',
            'issuer' => $leaf['issuer'],
            'signer' => $leaf['signer'],
            'valid_from' => $leaf['valid_from'],
            'expires_at' => $leaf['expires_at'],
            'days_remaining' => $leaf['days_remaining'],
            'dns' => ['addresses' => [TestNetwork::public(10)], 'expected' => [TestNetwork::public(10)], 'points_here' => true],
            'public' => $probe,
            'engine' => $probe + ['serves_installed' => true],
        ], $overrides);
    }
}
