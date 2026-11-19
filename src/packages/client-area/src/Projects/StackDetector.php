<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;

/**
 * The runtime stack of a project (old `ProjectStackDetector`,
 * packages/api/app/Lib/Project/ProjectStackDetector.php): WordPress for a
 * WordPress project, else read from the Engine's `docker compose ps` rows
 * (`GET /projects/{u}/containers`) – the first application image, skipping
 * databases and caches, labelled by a known recipe repository or the image
 * name, with its tag or OCI version label. A classic project has no containers
 * and a failed read falls back to the repository/source label, as before.
 *
 * The old panel cached the result on the panel row; the mirror has no column
 * for it, so it is computed when asked: the Admin Area's detected-stack
 * refresh, and the Client Area Source card's queued refresh
 * ({@see ProjectSourceDetails}).
 */
final class StackDetector
{
    /** @var list<string> */
    private const INTERNAL_SERVICE_NAMES = [
        'db', 'database', 'postgres', 'postgresql', 'mysql', 'mariadb', 'redis', 'cache', 'mongo', 'mongodb',
        'rabbitmq', 'amqp', 'memcached', 'elastic', 'elasticsearch', 'cassandra', 'influx', 'influxdb',
    ];

    /** @var list<string> */
    private const INTERNAL_SERVICE_IMAGE_REGEXES = [
        '/^postgres(:|$|-)/i',
        '/^postgresql(:|$|-)/i',
        '/^mysql(:|$|-)/i',
        '/^mariadb(:|$|-)/i',
        '/^redis(:|$|-)/i',
        '/^mongo(db)?(:|$|-)/i',
        '/^rabbitmq(:|$|-)/i',
        '/^memcached(:|$|-)/i',
        '/^elasticsearch(:|$|-)/i',
        '/^cassandra(:|$|-)/i',
        '/^influxdb(:|$|-)/i',
    ];

    /**
     * @return array<string, mixed>
     */
    public function detect(Application $application): array
    {
        if ($application->type === Application::TYPE_WORDPRESS) {
            return ['label' => 'WordPress', 'kind' => 'wordpress', 'source' => 'wordpress', 'version' => null, 'primary_image' => null, 'services' => []];
        }

        if (! $application->isContainer()) {
            return $this->fallback($application);
        }

        try {
            $containers = (new ContainersApi($application->engine()))->list($application->engineProject());
        } catch (EngineException $e) {
            report($e);

            return $this->fallback($application);
        }

        return $this->fromContainers($application, $containers);
    }

    /**
     * The project's source context: `type`, `source_type`, `repo_name`.
     *
     * @return array{type: string, source_type: string|null, repo_name: string|null}
     */
    public static function context(Application $application): array
    {
        $type = $application->type === Application::TYPE_WORDPRESS ? Application::TYPE_WORDPRESS : Application::TYPE_CUSTOM;
        if ($type === Application::TYPE_WORDPRESS) {
            return ['type' => $type, 'source_type' => null, 'repo_name' => null];
        }

        $repo = $application->gitRepositoryUrl();

        return [
            'type' => $type,
            'source_type' => $repo !== null ? 'git' : ($application->isContainer() ? 'files' : null),
            'repo_name' => ProjectStack::parseRepoName($repo),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $containers
     * @return array<string, mixed>
     */
    private function fromContainers(Application $application, array $containers): array
    {
        $services = [];
        foreach ($containers as $row) {
            $name = $this->serviceName($row);
            $image = Payload::nullableString($row['Image'] ?? $row['image'] ?? null);
            $state = Payload::nullableString($row['State'] ?? $row['state'] ?? $row['Status'] ?? null);
            if ($name === '' && $image === null) {
                continue;
            }

            $services[] = [
                'name' => $name !== '' ? $name : (self::imageBasename($image) ?? 'service'),
                'image' => $image,
                'state' => $state,
                'labels' => $row['Labels'] ?? $row['labels'] ?? null,
            ];
        }

        if ($services === []) {
            return $this->fallback($application);
        }

        $primaryImage = $this->primaryImage($services);
        $version = self::imageTag($primaryImage) ?? $this->versionFromLabels($services, $primaryImage);

        $context = self::context($application);
        $base = ProjectStack::KNOWN_REPO_LABELS[strtolower((string) $context['repo_name'])] ?? self::imageBasename($primaryImage)
            ?? ProjectStack::label($context['type'], null, $context['source_type'], $context['repo_name'], null);

        return [
            'label' => self::withVersion($base, $version),
            'kind' => 'custom',
            'source' => 'containers',
            'version' => $version,
            'primary_image' => $primaryImage,
            'services' => array_map(static fn (array $service): array => [
                'name' => $service['name'],
                'image' => $service['image'],
                'state' => $service['state'],
            ], $services),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function fallback(Application $application): array
    {
        $context = self::context($application);

        return [
            'label' => ProjectStack::label($context['type'], null, $context['source_type'], $context['repo_name'], null),
            'kind' => 'custom',
            'source' => 'repo_infer',
            'version' => null,
            'primary_image' => null,
            'services' => [],
        ];
    }

    /**
     * @param  list<array{name: string, image: string|null, state: string|null, labels: mixed}>  $services
     */
    private function primaryImage(array $services): ?string
    {
        foreach ($services as $service) {
            if ($service['image'] !== null && $service['image'] !== '' && ! $this->isInternal($service['name'], $service['image'])) {
                return $service['image'];
            }
        }
        foreach ($services as $service) {
            if ($service['image'] !== null && $service['image'] !== '') {
                return $service['image'];
            }
        }

        return null;
    }

    private function isInternal(string $name, ?string $image): bool
    {
        if (in_array(strtolower(trim($name)), self::INTERNAL_SERVICE_NAMES, true)) {
            return true;
        }

        $basename = self::imageBasename($image);
        if ($basename === null) {
            return false;
        }
        foreach (self::INTERNAL_SERVICE_IMAGE_REGEXES as $regex) {
            if (preg_match($regex, $basename) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function serviceName(array $row): string
    {
        // Compose's `Name` is `project-service-1`; `Service` wins when present.
        foreach (['Service', 'Name', 'name', 'service'] as $key) {
            $value = Payload::nullableString($row[$key] ?? null);
            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * The OCI `org.opencontainers.image.version` label of the primary image's
     * service (a map, or compose's `key=value,…` string).
     *
     * @param  list<array{name: string, image: string|null, state: string|null, labels: mixed}>  $services
     */
    private function versionFromLabels(array $services, ?string $primaryImage): ?string
    {
        $key = 'org.opencontainers.image.version';
        $version = '';
        foreach ($services as $service) {
            if ($primaryImage === null || $service['image'] !== $primaryImage) {
                continue;
            }
            if (is_array($service['labels'])) {
                $version = Payload::string($service['labels'][$key] ?? null);
            } elseif (is_string($service['labels'])) {
                foreach (explode(',', $service['labels']) as $part) {
                    $pair = explode('=', trim($part), 2);
                    if (count($pair) === 2 && $pair[0] === $key) {
                        $version = $pair[1];
                    }
                }
            }
            break;
        }

        return $version === '' || strcasecmp($version, 'latest') === 0 ? null : $version;
    }

    private static function withVersion(string $base, ?string $version): string
    {
        if ($version === null || $version === '' || $base === $version || str_ends_with($base, ' '.$version)) {
            return $base;
        }

        return $base.' '.$version;
    }

    /**
     * The image name without registry path, tag or digest
     * (`docker.n8n.io/n8nio/n8n:1.x` → `n8n`).
     */
    public static function imageBasename(?string $image): ?string
    {
        if ($image === null || $image === '') {
            return null;
        }

        $name = self::imageName($image);
        $colon = strrpos($name, ':');
        if ($colon !== false) {
            $name = substr($name, 0, $colon);
        }

        return $name !== '' ? $name : null;
    }

    /**
     * The image tag, or null when missing or `latest`.
     */
    public static function imageTag(?string $image): ?string
    {
        if ($image === null || $image === '') {
            return null;
        }

        $name = self::imageName($image);
        $colon = strrpos($name, ':');
        if ($colon === false) {
            return null;
        }

        $tag = substr($name, $colon + 1);

        return $tag === '' || strcasecmp($tag, 'latest') === 0 ? null : $tag;
    }

    /**
     * The last path segment of an image reference, digest dropped.
     */
    private static function imageName(string $image): string
    {
        $withoutDigest = explode('@', $image, 2)[0];
        $slash = strrpos($withoutDigest, '/');

        return $slash === false ? $withoutDigest : substr($withoutDigest, $slash + 1);
    }
}
