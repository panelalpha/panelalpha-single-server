<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Community\Console\HubClaimInstallCodeCommand;
use PanelAlpha\Community\Hub\InstallCodeInput;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * `hub:claim-install-code`: the installer's `--hub-code`, claimed once at the
 * first boot (contract 1.7).
 */
class HubInstallCodeTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const ORIGIN = 'https://panel.example.com';

    private const CODE = 'WDJB-MJHT';

    private const PASSWORD = 'Install-Password-42!';

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB, 'app.url' => self::ORIGIN]);
        $this->configureEngine();
        $this->input(self::CODE, self::PASSWORD);
    }

    private function input(string $code, string $password): void
    {
        $this->app->instance(InstallCodeInput::class, new class($code, $password) extends InstallCodeInput
        {
            public function __construct(private readonly string $code, private readonly string $password) {}

            public function read(): array
            {
                return ['code' => $this->code, 'password' => $this->password];
            }
        });
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function claimed(array $extra = []): array
    {
        return $extra + [
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'hub_url' => self::HUB,
            'account' => ['name' => 'Acme'],
            'user' => ['id' => 128, 'email' => 'Ada@Example.com', 'name' => 'Ada Lovelace'],
        ];
    }

    private function fakeHub(mixed $claim, mixed $report = null): void
    {
        Http::fake([
            // Defensive (not an Engine shape): only the two fields the panel reads (default_ipv4, host.hostname) are faked.
            self::ENGINE.'/system/info' => Http::response(['data' => [
                'default_ipv4' => TestNetwork::public(7),
                'host' => ['hostname' => 'box.example.com'],
            ]]),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
            self::HUB.'/api/panel/v1/install-codes/claim' => $claim,
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/report' => $report ?? Http::response([], 200),
        ]);
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

    public function test_an_accepted_code_sets_the_panel_up_and_pairs_it(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));

        $this->assertSame(HubClaimInstallCodeCommand::CONNECTED, $this->claim('Ada@Example.com'), Artisan::output());

        $user = User::query()->firstOrFail();
        $this->assertSame('ada@example.com', $user->email);
        $this->assertSame('Ada Lovelace', $user->name);
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertFalse((bool) $user->password_generated);
        $this->assertSame('box.example.com', app(PanelSettings::class)->get('userapp.name'));
        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
        $this->assertSame('Acme', app(PanelSettings::class)->get('hub.account_name'));
        $this->assertSame(self::ORIGIN, app(PanelSettings::class)->get('hub.admin_url'));
        $this->assertSame('128', app(PanelSettings::class)->get('hub.user_id'));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/install-codes/claim'
            && $r['code'] === self::CODE
            && $r['email'] === 'ada@example.com'
            && $r['product'] === 'single-server-community'
            && $r['panel']['admin_url'] === self::ORIGIN
            && $r['panel']['hostname'] === 'box.example.com'
            && $r['panel']['ip'] === TestNetwork::public(7));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report'
            && $r->hasHeader('X-Server-Id', 'srv_1'));
    }

    public function test_without_a_password_the_admin_gets_a_generated_one(): void
    {
        $this->input(self::CODE, '');
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));

        $this->assertSame(HubClaimInstallCodeCommand::CONNECTED, $this->claim(), Artisan::output());

        $this->assertTrue((bool) User::query()->firstOrFail()->password_generated);
    }

    public function test_a_lowercase_code_is_sent_in_capitals(): void
    {
        $this->input('wdjb-mjht', self::PASSWORD);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));

        $this->assertSame(HubClaimInstallCodeCommand::CONNECTED, $this->claim(), Artisan::output());
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/install-codes/claim') && $r['code'] === self::CODE);
    }

    /**
     * @return array<string, array{int, array<string, mixed>, string}>
     */
    public static function refusals(): array
    {
        return [
            'unknown, used or another email' => [400, ['error' => 'invalid_grant'], 'was made for another email'],
            'expired' => [400, ['error' => 'expired_token'], 'the code has expired'],
            'private address' => [422, ['error' => 'invalid_address'], 'needs a public IP address'],
            'wrong product' => [422, ['error' => 'wrong_product'], 'another kind of panel'],
            'throttled' => [429, [], 'too many attempts'],
            'server error' => [500, [], 'HTTP 500'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('refusals')]
    public function test_a_refused_code_changes_nothing(int $status, array $body, string $reason): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($body, $status));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());

        // The output is read once: Artisan::output() clears it.
        $output = Artisan::output();
        $this->assertStringContainsString('Could not connect to PanelAlpha: ', $output);
        $this->assertStringContainsString($reason, $output);
        $this->assertNothingPersisted();
        // One attempt: no retry, and no report for a pairing that does not exist.
        $this->assertCount(1, Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/install-codes/claim')));
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/report'));
    }

    public function test_a_hub_that_cannot_be_reached_changes_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(fn () => throw new ConnectionException('down'));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertStringContainsString('PanelAlpha could not be reached', Artisan::output());
        $this->assertNothingPersisted();
    }

    public function test_an_answer_for_another_account_changes_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed(['user' => ['id' => 9, 'email' => 'eve@example.com', 'name' => 'Eve']])));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertStringContainsString('answered for another account', Artisan::output());
        $this->assertNothingPersisted();
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/report'));
    }

    public function test_an_answer_without_the_hub_users_id_changes_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed(['user' => ['email' => 'ada@example.com', 'name' => 'Ada']])));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertStringContainsString('did not say which account the code belongs to', Artisan::output());
        $this->assertNothingPersisted();
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/report'));
    }

    public function test_an_incomplete_answer_changes_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed(['server_secret' => ''])));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertNothingPersisted();
    }

    public function test_a_401_on_the_first_report_rolls_the_setup_back(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub(Http::response($this->claimed()), Http::response(['error' => 'unknown_server'], 401));

        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->assertStringContainsString('did not accept the connection', Artisan::output());
        $this->assertNothingPersisted();
    }

    public function test_a_5xx_on_the_first_report_keeps_the_setup(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub(Http::response($this->claimed()), Http::response('boom', 502));

        $code = $this->claim();
        $output = Artisan::output();
        $this->assertSame(HubClaimInstallCodeCommand::CONNECTED, $code, $output);
        $this->assertStringContainsString('the first report will be sent again', $output);
        $this->assertDatabaseCount('users', 1);
        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
    }

    public function test_a_panel_that_is_set_up_already_sends_nothing(): void
    {
        User::factory()->create();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));

        $this->assertSame(HubClaimInstallCodeCommand::SETUP_DONE, $this->claim());
        Http::assertNothingSent();
    }

    public function test_a_missing_code_or_an_invalid_email_sends_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::response($this->claimed()));

        $this->input('', self::PASSWORD);
        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->input('WDJB MJHT', self::PASSWORD);
        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim());
        $this->input(self::CODE, self::PASSWORD);
        $this->assertSame(HubClaimInstallCodeCommand::REFUSED, $this->claim('ada'));

        Http::assertNothingSent();
        $this->assertNothingPersisted();
    }

    public function test_the_code_and_the_password_are_never_printed_or_logged(): void
    {
        $records = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$records): void {
            $records[] = $e->message.json_encode($e->context);
        });
        // Control: the listener does see what is logged.
        Log::info('control');
        $this->assertCount(1, $records);

        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
        $this->fakeHub(Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
            ->push(['error' => 'invalid_grant'], 400)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see the Hub's PANEL-LOGIN-CONTRACT.md 1.7
            ->push($this->claimed()));
        $this->claim();
        $output = Artisan::output();
        $this->claim();
        $output .= Artisan::output();

        $this->assertGreaterThan(1, count($records));
        foreach ([...$records, $output] as $text) {
            $this->assertStringNotContainsString(self::CODE, $text);
            $this->assertStringNotContainsString(self::PASSWORD, $text);
            $this->assertStringNotContainsString('the-server-secret', $text);
        }
    }
}
