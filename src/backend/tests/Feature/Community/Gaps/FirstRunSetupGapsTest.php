<?php

namespace Tests\Feature\Community\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use PanelAlpha\Community\Http\Requests\BackupSettingsRequest;
use PanelAlpha\Community\Http\Requests\BackupStoreRequest;
use PanelAlpha\Community\Http\Requests\SettingsRequest;
use PanelAlpha\Community\Http\Requests\SettingsUrlRequest;
use PanelAlpha\Community\Http\Requests\SetupRequest;
use PanelAlpha\Community\Setup\FirstRunSetup;
use PanelAlpha\Community\Setup\SetupAlreadyDone;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The first-run setup guards and the form requests of the Community panel. The
 * requests are used for their rules only (the routes authorize through
 * middleware), so each one authorizes everyone.
 */
class FirstRunSetupGapsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_setup_needs_a_browser_session(): void
    {
        $this->expectException(LogicException::class);

        app(FirstRunSetup::class)->run(fn (): User => User::factory()->create(), 'My Server');
    }

    public function test_the_unattended_setup_is_refused_when_a_user_exists(): void
    {
        User::factory()->create();

        $this->expectException(SetupAlreadyDone::class);

        app(FirstRunSetup::class)->runUnattended(fn (): User => User::factory()->create(), 'My Server');
    }

    /**
     * @return array<string, array{class-string}>
     */
    public static function requestProvider(): array
    {
        return [
            'settings' => [SettingsRequest::class],
            'settings url' => [SettingsUrlRequest::class],
            'setup' => [SetupRequest::class],
            'backup store' => [BackupStoreRequest::class],
            'backup settings' => [BackupSettingsRequest::class],
        ];
    }

    /**
     * @param  class-string<SettingsRequest|SettingsUrlRequest|SetupRequest|BackupStoreRequest|BackupSettingsRequest>  $class
     */
    #[DataProvider('requestProvider')]
    public function test_each_request_authorizes_everyone_and_leaves_access_to_the_route(string $class): void
    {
        $this->assertTrue((new $class)->authorize());
    }

    /**
     * @return array<string, array{string, string, int}>
     */
    public static function urlPartsProvider(): array
    {
        return [
            'an unparsable url keeps its text' => ['https://:80', 'https://:80', 443],
            'an empty query is not an origin' => ['https://x.example.com?', 'https://x.example.com?', 443],
            'an empty fragment is not an origin' => ['https://x.example.com#', 'https://x.example.com#', 443],
        ];
    }

    #[DataProvider('urlPartsProvider')]
    public function test_a_url_that_is_more_than_an_origin_has_no_parts(string $url, string $origin, int $port): void
    {
        $this->assertSame($origin, SettingsUrlRequest::originOf($url));
        $this->assertSame('', SettingsUrlRequest::hostOf($url));
        $this->assertSame($port, SettingsUrlRequest::portOf($url));
    }
}
