<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Labels\LabelService;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use PanelAlpha\ClientArea\Models\Label;
use PanelAlpha\ClientArea\Onboarding\WordPressOrg;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;
use PanelAlpha\ClientArea\Projects\ProjectStack;
use PanelAlpha\ClientArea\Projects\StackDetector;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Small Client Area services and helpers: label limits and misses, the
 * WordPress.org lookups when the network fails and the text helpers of the
 * project page.
 */
class SmallServicesGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    // ---- LabelService ---------------------------------------------------

    public function test_a_user_cannot_have_more_labels_than_the_limit(): void
    {
        $user = User::factory()->create();
        $service = app(LabelService::class);
        foreach (range(1, LabelService::MAX_PER_USER) as $i) {
            $service->create($user, 'label '.$i, '#aabbcc');
        }

        try {
            $service->create($user, 'one too many', '#aabbcc');
            $this->fail('The label limit must be enforced.');
        } catch (ValidationException $e) {
            $this->assertSame(['The label limit has been reached.'], $e->errors()['title']);
        }

        $this->assertSame(LabelService::MAX_PER_USER, Label::query()->count());
    }

    public function test_deleting_a_label_the_user_does_not_have_says_it_was_not_found(): void
    {
        $this->expectExceptionObject(ValidationException::withMessages(['title' => ['Label not found.']]));

        app(LabelService::class)->deleteByTitle(User::factory()->create(), 'missing');
    }

    public function test_assigning_a_label_the_user_does_not_have_says_it_was_not_found(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        $this->expectExceptionObject(ValidationException::withMessages(['title' => ['Label not found.']]));

        app(LabelService::class)->assign($application, $user, 'missing');
    }

    public function test_removing_a_label_the_project_does_not_carry_says_it_was_not_found(): void
    {
        $application = $this->syncedApplication(User::factory()->create());

        $this->expectExceptionObject(ValidationException::withMessages(['title' => ['Label not found.']]));

        app(LabelService::class)->unassign($application, 'missing');
    }

    public function test_a_project_label_belongs_to_its_project_and_its_label(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $service = app(LabelService::class);
        $label = $service->create($user, 'live', '#aabbcc');
        $service->assign($application, $user, 'live');

        $row = ApplicationLabel::query()->firstOrFail();

        $this->assertTrue($row->application->is($application));
        $this->assertTrue($row->label->is($label));
    }

    // ---- WordPressOrg ---------------------------------------------------

    public function test_the_theme_search_is_empty_when_wordpress_org_cannot_be_reached(): void
    {
        // External: https://developer.wordpress.org/reference/functions/themes_api/ (api.wordpress.org/themes/info/1.2/; the connection fails)
        Http::fake(['api.wordpress.org/themes/info/*' => Http::failedConnection()]);

        $this->assertSame(['themes' => [], 'info' => []], app(WordPressOrg::class)->themes('shop'));
    }

    public function test_the_version_list_is_empty_when_wordpress_org_cannot_be_reached(): void
    {
        // External: https://codex.wordpress.org/WordPress.org_API (api.wordpress.org/core/version-check/1.7/; the connection fails)
        Http::fake(['api.wordpress.org/core/version-check/*' => Http::failedConnection()]);

        $this->assertSame([], app(WordPressOrg::class)->availableVersions());
    }

    // ---- ProjectStack and ProjectSourceReport ---------------------------

    public function test_the_wordpress_version_colour_is_not_used_for_a_stack_detected_from_containers(): void
    {
        $this->assertFalse(ProjectStack::usesWordpressVersionColoring('wordpress', '6.5', ['source' => 'containers']));
    }

    /**
     * @return array<string, array{?string, ?string}>
     */
    public static function repoNameProvider(): array
    {
        return [
            'null' => [null, null],
            'empty' => ['', null],
            'a host without a path' => ['https://github.com', null],
            'a path of only .git' => ['https://github.com/.git', null],
            'one segment' => ['https://github.com/solo', 'solo'],
            'owner and name' => ['https://github.com/acme/site.git', 'acme/site'],
            'a nested group' => ['https://gitlab.com/group/sub/site', 'sub/site'],
        ];
    }

    #[DataProvider('repoNameProvider')]
    public function test_the_repository_name_is_read_from_the_url(?string $url, ?string $name): void
    {
        $this->assertSame($name, ProjectStack::parseRepoName($url));
    }

    public function test_split_commands_keeps_an_escaped_quote_inside_a_quoted_argument(): void
    {
        $commands = ProjectSourceReport::splitCommands('echo "a \" && b" && npm ci');

        $this->assertSame(['echo "a \" && b"', 'npm ci'], $commands);
    }

    public function test_a_service_with_an_image_that_has_no_name_is_not_internal_and_is_still_listed(): void
    {
        $application = $this->syncedApplication(User::factory()->create(), 'site1', ['details' => ['template' => 'dind']]);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:82 -> containers index
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
            ['Service' => 'web', 'Image' => ':', 'State' => 'running'],
        ]])]);

        $stack = app(StackDetector::class)->detect($application);

        $this->assertSame(':', $stack['primary_image']);
        $this->assertSame('web', $stack['services'][0]['name']);
    }
}
