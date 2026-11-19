<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\StackDetector;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * StackDetector: the label, version and primary image the project page shows
 * for a container project, from the Engine container list.
 */
class StackDetectorGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1', ['details' => ['template' => 'dind']]);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function detect(array $rows): array
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/ContainerController.php:82 -> containers index
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['data' => $rows])]);

        return app(StackDetector::class)->detect($application);
    }

    public function test_a_row_without_a_name_and_an_image_is_ignored_and_no_rows_fall_back_to_the_repo_label(): void
    {
        $stack = $this->detect([['State' => 'running']]);

        $this->assertSame('repo_infer', $stack['source']);
        $this->assertSame([], $stack['services']);
    }

    public function test_the_primary_image_skips_the_database_service(): void
    {
        $stack = $this->detect([
            ['Service' => 'db', 'Image' => 'mariadb:11', 'State' => 'running'],
            ['Service' => 'web', 'Image' => 'ghcr.io/acme/shop:2.4', 'State' => 'running'],
        ]);

        $this->assertSame('ghcr.io/acme/shop:2.4', $stack['primary_image']);
        $this->assertSame('2.4', $stack['version']);
        $this->assertSame('shop 2.4', $stack['label']);
    }

    public function test_a_service_with_a_database_image_is_internal_whatever_its_name(): void
    {
        $stack = $this->detect([
            ['Service' => 'store', 'Image' => 'postgres:16', 'State' => 'running'],
            ['Service' => 'app', 'Image' => 'acme/api:1.0', 'State' => 'running'],
        ]);

        $this->assertSame('acme/api:1.0', $stack['primary_image']);
    }

    public function test_when_every_service_is_internal_the_first_image_is_the_primary_one(): void
    {
        $stack = $this->detect([
            ['Service' => 'db', 'Image' => 'postgres:16', 'State' => 'running'],
            ['Service' => 'cache', 'Image' => 'redis:7', 'State' => 'running'],
        ]);

        $this->assertSame('postgres:16', $stack['primary_image']);
    }

    public function test_services_without_an_image_have_no_primary_image(): void
    {
        $stack = $this->detect([['Service' => 'web', 'State' => 'running']]);

        $this->assertNull($stack['primary_image']);
        $this->assertNull($stack['version']);
    }

    public function test_a_row_without_a_name_takes_the_image_name_as_its_service_name(): void
    {
        $stack = $this->detect([['Image' => 'ghcr.io/acme/shop', 'State' => 'running']]);

        $this->assertSame('shop', $stack['services'][0]['name']);
    }

    public function test_the_version_comes_from_the_image_label_list_when_the_image_has_no_tag(): void
    {
        $stack = $this->detect([
            ['Service' => 'web', 'Image' => 'acme/shop', 'Labels' => 'a=b,org.opencontainers.image.version=3.1,c=d'],
        ]);

        $this->assertSame('3.1', $stack['version']);
    }

    public function test_the_version_comes_from_the_image_label_map_when_the_image_has_no_tag(): void
    {
        $stack = $this->detect([
            ['Service' => 'web', 'Image' => 'acme/shop', 'Labels' => ['org.opencontainers.image.version' => '4.2']],
        ]);

        $this->assertSame('4.2', $stack['version']);
    }

    public function test_the_version_of_another_service_image_is_not_taken(): void
    {
        $stack = $this->detect([
            ['Service' => 'web', 'Image' => 'acme/shop', 'Labels' => 'org.opencontainers.image.version=1.0'],
            ['Service' => 'db', 'Image' => 'mariadb', 'Labels' => 'org.opencontainers.image.version=11.0'],
        ]);

        $this->assertSame('1.0', $stack['version']);
    }

    public function test_a_latest_label_is_no_version(): void
    {
        $stack = $this->detect([
            ['Service' => 'web', 'Image' => 'acme/shop', 'Labels' => 'org.opencontainers.image.version=LATEST'],
        ]);

        $this->assertNull($stack['version']);
    }

    /**
     * @return array<string, array{?string, ?string, ?string}>
     */
    public static function imageProvider(): array
    {
        return [
            'null' => [null, null, null],
            'empty' => ['', null, null],
            'plain' => ['nginx', 'nginx', null],
            'tag' => ['nginx:1.27', 'nginx', '1.27'],
            'latest' => ['nginx:latest', 'nginx', null],
            'registry and digest' => ['ghcr.io/acme/shop:2.0@sha256:abc', 'shop', '2.0'],
            'a trailing colon' => ['nginx:', 'nginx', null],
            'only a colon' => [':', null, null],
        ];
    }

    #[DataProvider('imageProvider')]
    public function test_image_name_and_tag_are_read_from_the_reference(?string $image, ?string $basename, ?string $tag): void
    {
        $this->assertSame($basename, StackDetector::imageBasename($image));
        $this->assertSame($tag, StackDetector::imageTag($image));
    }
}
