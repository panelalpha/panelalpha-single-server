<?php

namespace Tests\Unit\Packages\Community;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Community\Console\HubClaimInstallCodeCommand;
use PanelAlpha\Community\Hub\InstallCodeInput;
use PanelAlpha\Community\Setup\FirstRunSetup;
use PanelAlpha\Community\Setup\SetupAlreadyDone;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;
use Throwable;

/**
 * The refusal and failure branches of `hub:claim-install-code` that the
 * feature test (`HubInstallCodeTest`) does not reach: other editions, a setup
 * that lost a race, a user the host refuses and an unexpected failure.
 */
final class HubClaimInstallCodeBranchesTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const HUB = 'https://hub.example.test';

    /** @var list<array{string, string, array<string, mixed>}> */
    private array $logs = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB, 'app.url' => 'https://panel.example.com']);
        $this->configureEngine();
        $this->app->instance(InstallCodeInput::class, new class extends InstallCodeInput
        {
            public function read(): array
            {
                return ['code' => 'WDJB-MJHT', 'password' => 'Install-Password-42!'];
            }
        });

        Event::listen(MessageLogged::class, function (MessageLogged $event): void {
            $this->logs[] = [$event->level, $event->message, $event->context];
        });
    }

    /**
     * @param  mixed  $claim  the Hub's answer to the claim
     */
    private function fakeHub(mixed $claim): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:64
            self::ENGINE.'/system/info' => Http::response(['data' => ['default_ipv4' => TestNetwork::public(7), 'host' => ['hostname' => 'box.example.com']]]),
            // Defensive (not an Engine shape): PanelAlpha Hub contract 1.7, POST /api/panel/v1/install-codes/claim (src/packages/hub/docs/hub-connect-contract.md)
            self::HUB.'/api/panel/v1/install-codes/claim' => $claim,
            // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
            self::HUB.'/api/panel/v1/report' => Http::response([], 200),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function claimed(): array
    {
        return [
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'hub_url' => self::HUB,
            'account' => ['name' => 'Acme'],
            'user' => ['id' => 128, 'email' => 'ada@example.com', 'name' => 'Ada Lovelace'],
        ];
    }

    private function claim(string $email = 'ada@example.com'): int
    {
        return Artisan::call('hub:claim-install-code', ['email' => $email]);
    }

    private function assertNothingPersisted(): void
    {
        $this->assertDatabaseCount('users', 0);
        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
        $this->assertNull(app(PanelSettings::class)->get('hub.server_secret'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.name'));
    }

    public function test_a_multi_user_edition_is_refused_before_anything_is_sent(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        $this->bindMultiUserEdition([]);

        $this->assertSame(HubClaimInstallCodeCommand::FAILURE, $this->claim());
        $this->assertStringContainsString('single-user panel only', Artisan::output());
        Http::assertNothingSent();
    }

    public function test_a_setup_that_lost_the_race_to_another_path_is_reported_as_done(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        $this->app->instance(FirstRunSetup::class, new class extends FirstRunSetup
        {
            public function __construct() {}

            public function runUnattended(callable $createUser, string $serverName, ?callable $alsoInTransaction = null): Authenticatable
            {
                throw new SetupAlreadyDone;
            }
        });

        $this->assertSame(HubClaimInstallCodeCommand::SETUP_DONE, $this->claim());
        $this->assertStringContainsString('set up already', Artisan::output());
        $this->assertNothingPersisted();
    }

    public function test_a_password_the_host_refuses_changes_nothing_and_says_why(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        $this->app->instance(InstallCodeInput::class, new class extends InstallCodeInput
        {
            public function read(): array
            {
                return ['code' => 'WDJB-MJHT', 'password' => 'weak'];
            }
        });

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());

        $this->assertStringContainsString('the admin could not be created', Artisan::output());
        $this->assertNothingPersisted();
    }

    public function test_a_validation_error_from_the_user_creator_is_reported_with_its_messages(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        $this->app->instance(FirstUserCreator::class, $this->failingCreator(ValidationException::withMessages(['email' => ['The email has already been taken.']])));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());

        $this->assertStringContainsString('The email has already been taken.', Artisan::output());
        $this->assertNothingPersisted();
    }

    public function test_an_unexpected_failure_leaves_no_admin_and_no_pairing_and_logs_only_the_class(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        $this->app->instance(FirstUserCreator::class, $this->failingCreator(new RuntimeException('database exploded for ada@example.com')));

        $this->assertSame(HubClaimInstallCodeCommand::FAILURE, $this->claim());

        $this->assertStringContainsString('The setup could not be finished; see the log.', Artisan::output());
        $this->assertNothingPersisted();
        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha install code setup failed');
        $this->assertSame(['exception' => RuntimeException::class], $warning[2] ?? null);
        $this->assertStringNotContainsString('ada@example.com', json_encode($this->logs, JSON_THROW_ON_ERROR));
    }

    /**
     * @return array<string, array{0: int, 1: array<string, mixed>, 2: string}>
     */
    public static function refusals(): array
    {
        return [
            'too many attempts' => [429, [], 'too many attempts'],
            'an invalid address' => [422, ['error' => 'invalid_address'], 'needs a public IP address and an https:// address'],
            'another product' => [422, ['error' => 'wrong_product'], 'another kind of panel'],
            'an expired code' => [400, ['error' => 'expired_token'], 'has expired'],
            'a used code' => [400, ['error' => 'invalid_grant'], 'used already'],
            'an error nobody knows' => [418, ['error' => 'teapot'], 'refused the code (HTTP 418)'],
            'an error that is not text' => [500, ['error' => ['x']], 'refused the code (HTTP 500)'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('refusals')]
    public function test_the_hubs_refusal_is_explained_in_plain_words(int $status, array $body, string $words): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($body, $status));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());

        $output = Artisan::output();
        $this->assertStringContainsString($words, $output);
        $this->assertStringContainsString('Connect later from Settings.', $output);
        $this->assertNothingPersisted();
    }

    public function test_a_non_200_success_status_is_still_a_refusal(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed(), 201));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertNothingPersisted();
    }

    public function test_a_panel_with_a_user_is_never_claimed_for(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));
        User::factory()->create();

        $this->assertSame(HubClaimInstallCodeCommand::SETUP_DONE, $this->claim());
        Http::assertNothingSent();
    }

    private function failingCreator(Throwable $failure): FirstUserCreator
    {
        return new class($failure) implements FirstUserCreator
        {
            public function __construct(private readonly Throwable $failure) {}

            public function create(string $email, string $password, ?string $name): Authenticatable
            {
                throw $this->failure;
            }

            public function createWithGeneratedPassword(string $email, ?string $name = null): Authenticatable
            {
                throw $this->failure;
            }
        };
    }
}
