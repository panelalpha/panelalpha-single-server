<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use App\Services\Auth\LoginResult;
use App\Support\HomePayload;
use App\Support\HomePayloadForUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use LogicException;
use PanelAlpha\ClientArea\Access\NoCommunityPanel;
use PanelAlpha\ClientArea\Access\NoHubLogin;
use PanelAlpha\ClientArea\Access\NoHubPairingStatus;
use PanelAlpha\ClientArea\Access\NoSetupRequired;
use PanelAlpha\ClientArea\Hosting\FirstEngineBackupContainer;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerArchiveRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Projects\ProjectStack;
use PanelAlpha\ClientArea\Support\NoLicenceProjectLimit;
use PanelAlpha\ClientArea\Support\NoNotificationTemplates;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The defaults Community binds for the seams the paid editions replace, the project
 * stack labels and a few request and model helpers no route reaches.
 */
class CommunityDefaultsAndSeamsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_community_defaults_answer_no(): void
    {
        $this->assertFalse((new NoCommunityPanel)->active());
        $this->assertFalse((new NoHubLogin)->available());
        $this->assertFalse((new NoHubPairingStatus)->paired());
        $this->assertFalse((new NoSetupRequired)->required());
        $this->assertNull((new NoLicenceProjectLimit)->limit());
    }

    public function test_community_sends_no_application_notification_email(): void
    {
        $templates = new NoNotificationTemplates;
        $notification = new ApplicationNotification(new Application, 'user.instance.create_finished');
        $user = new User;

        $this->assertTrue($templates->storesInApp($notification));
        $this->assertFalse($templates->mails($notification, $user));
        $this->assertNull($templates->inAppText($notification, $user));
        $this->assertNull($templates->passwordResetMail($user, 'https://panel.example.com/reset'));

        $this->expectException(LogicException::class);
        $templates->applicationMail($notification, $user);
    }

    public function test_the_set_password_step_is_a_login_result_with_its_answer(): void
    {
        $result = LoginResult::passwordSetup(['set_password' => true]);

        $this->assertSame(LoginResult::PASSWORD_SETUP, $result->status);
        $this->assertSame(['set_password' => true], $result->answer);
        $this->assertNull($result->user);
    }

    public function test_the_home_payload_for_a_user_builds_the_hosts_home(): void
    {
        $user = User::factory()->create();
        $home = app(HomePayload::class);

        $this->assertSame($home->build($user), (new HomePayloadForUser($home))->payloadFor($user));
    }

    /**
     * @return array<string, array{string, ?string, ?string, ?string, ?array<string, mixed>, string}>
     */
    public static function stackLabels(): array
    {
        return [
            'a cached label wins' => ['custom', null, null, null, ['label' => 'Cached'], 'Cached'],
            'an empty cached label is ignored' => ['wordpress', '6.5', null, null, ['label' => ''], 'WordPress 6.5'],
            'wordpress without a version' => ['wordpress', null, null, null, null, 'WordPress'],
            'wordpress with an empty version' => ['wordpress', '', null, null, null, 'WordPress'],
            'a files project' => ['custom', null, 'files', null, null, 'Docker (files)'],
            'a known repository' => ['custom', null, 'git', 'N8N-io/n8n', null, 'n8n'],
            'another repository' => ['custom', null, 'git', 'acme/site', null, 'Git · acme/site'],
            'nothing known' => ['custom', null, null, null, null, 'Custom'],
            'an empty repository name' => ['custom', null, 'git', '', null, 'Custom'],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $detected
     */
    #[DataProvider('stackLabels')]
    public function test_the_stack_label(string $type, ?string $version, ?string $source, ?string $repo, ?array $detected, string $expected): void
    {
        $this->assertSame($expected, ProjectStack::label($type, $version, $source, $repo, $detected));
    }

    /**
     * @return array<string, array{string, ?string, ?array<string, mixed>, bool}>
     */
    public static function versionColouring(): array
    {
        return [
            'a custom project' => ['custom', '6.5', null, false],
            'another detected source' => ['wordpress', '6.5', ['source' => 'laravel'], false],
            'the wordpress source' => ['wordpress', '6.5', ['source' => 'wordpress'], true],
            'no version' => ['wordpress', null, null, false],
            'an empty version' => ['wordpress', '', ['source' => ''], false],
            'a version' => ['wordpress', '6.5', null, true],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $detected
     */
    #[DataProvider('versionColouring')]
    public function test_the_version_colouring_follows_the_stack(string $type, ?string $version, ?array $detected, bool $expected): void
    {
        $this->assertSame($expected, ProjectStack::usesWordpressVersionColoring($type, $version, $detected));
    }

    /**
     * @return array<string, array{?string, ?string}>
     */
    public static function repositoryUrls(): array
    {
        return [
            'null' => [null, null],
            'empty' => ['', null],
            'no path' => ['https://github.com', null],
            'a git suffix' => ['https://github.com/acme/site.git', 'acme/site'],
            'a nested group' => ['https://gitlab.com/group/sub/site', 'sub/site'],
            'one segment' => ['https://git.example.com/site', 'site'],
            'only a git suffix' => ['https://git.example.com/.git', null],
        ];
    }

    #[DataProvider('repositoryUrls')]
    public function test_the_repository_name_is_the_last_two_path_segments(?string $url, ?string $expected): void
    {
        $this->assertSame($expected, ProjectStack::parseRepoName($url));
    }

    public function test_the_archive_request_needs_a_path(): void
    {
        $rules = (new FileManagerArchiveRequest)->rules();

        $this->assertTrue(Validator::make(['path' => '/public_html/a.zip'], $rules)->passes());
        $this->assertTrue(Validator::make(['path' => 'a.zip', 'zip_path' => null], $rules)->passes());
        $this->assertTrue(Validator::make(['zip_path' => 'a.zip'], $rules)->fails());
        $this->assertTrue(Validator::make(['path' => str_repeat('a', 4097)], $rules)->fails());
    }

    public function test_the_first_backup_container_is_the_engines_first(): void
    {
        $application = $this->bareApplication();
        $destination = new FirstEngineBackupContainer;

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        Http::fake(['engine.example.com/api/backup-containers' => Http::sequence()
            ->push(['data' => []])
            ->push(['data' => [['id' => 3, 'name' => 'local']]])
            ->push(['data' => [['name' => 'local']]])]);

        $this->assertNull($destination->containerFor($application));
        $this->assertSame('3', $destination->containerFor($application));
        $this->assertSame('local', $destination->containerFor($application));

        $this->assertNull($destination->keepLastFor($application));
    }

    public function test_an_import_record_belongs_to_its_project(): void
    {
        $application = $this->bareApplication();
        $import = WordPressImport::query()->create([
            'application_id' => $application->id,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'source_url' => 'https://www.blog.example.org',
            'status' => 'running',
        ]);

        $this->assertTrue($import->application->is($application));
        $this->assertInstanceOf(Application::class, $import->application);
    }

    private function bareApplication(): Application
    {
        $this->configureEngine();

        return Application::query()->create([
            'engine_id' => \PanelAlpha\EngineClient\EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
        ]);
    }
}
