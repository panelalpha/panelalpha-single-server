<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * "Install WordPress" on classic PHP hosting (through
 * Engine 2.2.0's `wp/core/download`): the CA's domain step created the classic
 * project (`ServiceDomainController::store`), this records the install form and
 * queues {@see InstallWordPressJob}, which composes the Engine calls. Old
 * `InstanceController::install` defaults (`getDefaultInstallParams`): https,
 * no subdirectory, `wp_` prefix, `admin`, the user's email and a generated
 * password; the site name defaults to the domain. The plan names the site
 * and may offer the database name.
 */
final class WordPressInstallService
{
    public const NOT_CLASSIC = 'WordPress is installed on a PHP hosting project; this project runs in its own containers.';

    public const ALREADY_INSTALLING = 'WordPress is already installed or being installed on this project.';

    public const NO_ADMIN_EMAIL = 'The WordPress administrator email is required.';

    /** Old `api/custom_validation.invalid_value`, the answer for a template that does not exist. */
    public const INVALID_VALUE = 'Invalid value';

    /** The Engine's `ValidatesMysqlName` message (core/app/Http/Requests/Concerns/ValidatesMysqlName.php:23). */
    public const DB_NAME_INVALID = 'Database name must start with a letter, underscore or hyphen and can only contain letters, numbers, underscores and hyphens.';

    /** The Engine's prefixed-length refusal (core/app/Http/Controllers/User/Mysql/DatabaseController.php:156). */
    public const DB_NAME_TOO_LONG = 'Database name with prefix exceeds 64 characters (MySQL limit).';

    public const NO_CLONE = 'Not available on PanelAlpha Engine: a new site cannot be cloned from another project during onboarding.';

    /** The create names another project's `domain_id` (its domain is already in use), never one it made itself. */
    public const NOT_NEW_SITE = 'This project was not created for this install. Create a new site to install WordPress.';

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly ServiceDirectory $services,
        private readonly ServiceOnboarding $onboarding,
    ) {}

    /**
     * @param  array<string, mixed>  $params  the validated InstallWordPressRequest
     *
     * @throws ValidationException a container project, a project this install did not create, an install already running or done,
     *                             no admin email
     */
    public function start(Authenticatable $user, array $params): Application
    {
        $application = $this->applications->findForUser($user, Payload::int($params['domain_id'] ?? null) ?? 0);

        if ($application->isContainer()) {
            throw ValidationException::withMessages([self::NOT_CLASSIC]);
        }
        // Only the project the domain step created for this install is a
        // target: it carries the `onboarding_at` marker and nothing deployed
        // into it yet (ClassicOnboardingState). Any other project the caller
        // names - its domain is another site - is refused.
        if (! ClassicOnboardingState::isUntouchedOnboardingProject($application)) {
            throw ValidationException::withMessages([self::NOT_NEW_SITE]);
        }
        $existing = $application->wordpressInstall;
        if ($existing !== null && $existing->status !== WordPressInstall::FAILED) {
            throw ValidationException::withMessages([self::ALREADY_INSTALLING]);
        }
        $service = $this->services->ofApplication($application);
        $this->assertInstallType($service, Payload::nullableString($params['install_type'] ?? null));

        // The plan names the site; v1's default is the
        // domain.
        $title = $this->onboarding->siteName($service, Payload::nullableString($params['name'] ?? null), $this->siteNames($user));

        $email = Payload::nullableString($params['admin_email'] ?? null) ?? Payload::nullableString(data_get($user, 'email'));
        if ($email === null || $email === '') {
            throw ValidationException::withMessages(['admin_email' => [self::NO_ADMIN_EMAIL]]);
        }

        $domain = (string) $application->domain;
        $dir = trim(Payload::string($params['dir'] ?? ''), '/');
        $title = $title === null || trim($title) === '' ? $domain : trim($title);
        $version = Payload::nullableString($params['version'] ?? null);

        $install = [
            'url' => (Payload::nullableString($params['protocol'] ?? null) ?? 'https://').$domain.($dir === '' ? '' : '/'.$dir),
            'title' => $title,
            'admin_user' => self::filled($params['admin_username'] ?? null, 'admin'),
            'admin_email' => $email,
            'admin_password' => self::filled($params['admin_password'] ?? null, Str::password(16, symbols: false)),
            'locale' => self::locale(Payload::nullableString($params['language'] ?? null)),
            'version' => $version === null || $version === '' || $version === 'latest' ? null : $version,
            'dir' => $dir,
            'db_prefix' => self::filled($params['db_prefix'] ?? null, 'wp_'),
            // The advanced form's database name, when the plan's form offers
            // it; otherwise the job generates one.
            'db_name' => $this->databaseName($application, $service, $params),
            'theme' => Payload::nullableString($params['theme'] ?? null),
        ];

        WordPressInstall::query()->updateOrCreate(
            ['application_id' => $application->id],
            ['status' => WordPressInstall::IN_PROGRESS, 'params' => $install, 'error' => null],
        );
        $application->forceFill(['site_name' => $title])->save();
        $application->unsetRelation('wordpressInstall');

        InstallWordPressJob::dispatch($application->id);

        return $application;
    }

    /**
     * Re-run a failed install with its recorded form (old `retryInstall`):
     * false when the project has no failed WordPress install.
     */
    public function retry(Application $application): bool
    {
        $install = $application->wordpressInstall;
        if ($install === null || $install->status !== WordPressInstall::FAILED) {
            return false;
        }

        $install->update(['status' => WordPressInstall::IN_PROGRESS, 'error' => null]);
        InstallWordPressJob::dispatch($application->id);

        return true;
    }

    /**
     * The advanced form's install types. Only the
     * advanced onboarding honoured `install_type` (old
     * `generateStandardInstallParams()`, packages/api/app/Http/Requests/User/
     * InstanceInstallRequest.php:80-111, chosen by the plan's mode in
     * InstanceController.php:425-429); the simple and quick ones forced a
     * clean install, as v1 does for them (Community is always simple). A template
     * never exists in v1, so a template install is the old "Invalid
     * value"; a clone is refused – the Engine's clone makes a new project,
     * while the onboarding's domain step already made this one.
     *
     * @throws ValidationException
     */
    private function assertInstallType(HostingService $service, ?string $type): void
    {
        if ($type !== 'template' && $type !== 'clone') {
            return;
        }
        if ($this->onboarding->mode($service) !== ServiceOnboarding::ADVANCED) {
            return;
        }

        throw $type === 'template'
            ? ValidationException::withMessages(['template_id' => [self::INVALID_VALUE]])
            : ValidationException::withMessages(['install_type' => [self::NO_CLONE]]);
    }

    /**
     * The typed `db_name` while the plan's form offers the field
     * (`standard_fields.database_name`, OnboardingStandardFormModal.vue:496-505);
     * Community's answer has it off, so Community keeps generating the name. The name
     * follows the Engine's grammar (`ValidatesMysqlName`, ≤ 64 characters with
     * the `<username>_` prefix, `DatabaseController::store`), checked before
     * the install starts.
     *
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    private function databaseName(Application $application, HostingService $service, array $params): ?string
    {
        $offered = $this->onboarding->homeFields($service)['standard_fields']['database_name'] ?? false;
        $name = Payload::nullableString($params['db_name'] ?? null);
        if ($offered !== true || $name === null || $name === '') {
            return null;
        }

        if (preg_match('/^[A-Za-z_-][A-Za-z0-9_-]*$/D', $name) !== 1) {
            throw ValidationException::withMessages(['db_name' => [self::DB_NAME_INVALID]]);
        }
        $prefix = $application->engine_username.'_';
        if (strlen(str_starts_with($name, $prefix) ? $name : $prefix.$name) > 64) {
            throw ValidationException::withMessages(['db_name' => [self::DB_NAME_TOO_LONG]]);
        }

        return $name;
    }

    /**
     * The site names the user's projects carry (old `generateSiteName()`
     * compared the user's application names).
     *
     * @return list<string>
     */
    private function siteNames(Authenticatable $user): array
    {
        $names = [];
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            foreach ([$application->site_name, $application->name] as $name) {
                if (is_string($name) && $name !== '') {
                    $names[] = $name;
                }
            }
        }

        return $names;
    }

    /**
     * The given string, or the default when it is missing or empty.
     */
    private static function filled(mixed $value, string $default): string
    {
        $string = Payload::nullableString($value);

        return $string === null || $string === '' ? $default : $string;
    }

    /**
     * A WordPress locale for `wp core download --locale` and `wp/language`, or
     * null for the default (en_US). The CA sends WordPress locale codes
     * (`pl_PL`) and `en`; the old default `english` and anything the Engine
     * would refuse (`WpCoreDownloadRequest` locale pattern) mean the default.
     */
    public static function locale(?string $language): ?string
    {
        if ($language === null || in_array($language, ['', 'en', 'en_US', 'english'], true)) {
            return null;
        }

        return preg_match('/^[a-z]{2,3}(_[A-Z]{2})?(_[a-z0-9]+)?$/', $language) === 1 ? $language : null;
    }
}
