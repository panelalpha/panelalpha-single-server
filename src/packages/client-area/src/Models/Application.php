<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\ClientArea\Hosting\DocumentRootResolver;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\PresentedDomain;
use PanelAlpha\ClientArea\Support\SelfProject;

/**
 * One Engine project as the panel knows it ("instance"/"project" in the
 * Client Area, "server account" on hosting pages – all the same thing).
 *
 * Rows are written by ApplicationSynchronizer (from GET /projects/all) and by
 * provisioners. The `id` is the panel's own and is what the Client Area uses in
 * every URL; never expose engine_project_id as the id (it collides across Engines).
 *
 * @property int $id
 * @property int|null $service_id
 * @property int $engine_id
 * @property int|null $engine_project_id
 * @property string $engine_username Engine project name; the {u} in /api/projects/{u}/...
 * @property string|null $name
 * @property string|null $site_name panel-owned WordPress site name
 * @property string|null $domain
 * @property string $status Engine status: active | suspended | pending
 * @property string|null $type wordpress | custom | null (not detected yet)
 * @property int $screenshot_time unix timestamp of the cached screenshot
 * @property string|null $git_source repository URL the panel deployed from
 * @property string|null $git_last_commit_hash last commit deployed from git
 * @property string|null $git_last_commit_message message of the last deployed commit
 * @property \Illuminate\Support\Carbon|null $git_last_commit_at time of the last deployed commit
 * @property string|null $git_provider git | github | gitlab | bitbucket
 * @property string|null $git_token provider token, encrypted at rest (never exposed)
 * @property string|null $git_webhook_id Engine deploy-hook id for auto deploy
 * @property \Illuminate\Support\Carbon|null $git_delivery_imported_at watermark of imported hook deliveries
 * @property list<string>|null $git_delivery_imported_keys keys of imported deliveries remembered against a retention prune
 * @property string|null $git_hook_deploy_id hook-deploy follower marker: the newest finished Engine deploy it handled ('' none yet, null never ran; a controller column)
 * @property bool|null $dns_alerts_enabled DNS warning badge shown (default true; null on an unsaved model)
 * @property int|null $staging_of_id
 * @property \Illuminate\Support\Carbon|null $staging_creating_at when the staging copy is still being watched
 * @property \Illuminate\Support\Carbon|null $staging_create_failed_at when the staging copy was seen failing
 * @property \Illuminate\Support\Carbon|null $onboarding_files_at files-onboarding marker, set after the Engine create task and cleared by the first accepted deploy
 * @property \Illuminate\Support\Carbon|null $onboarding_at classic domain-step marker: the project a plain (no `source_type`) domain step created and no deploy has touched yet
 * @property \Illuminate\Support\Carbon|null $replacing_at classic-onboarding replacement marker: the sync keeps the row while the replace job swaps the Engine project
 * @property array<string, mixed>|null $engine_payload last UserResource seen on the Engine
 * @property \Illuminate\Support\Carbon|null $engine_created_at
 * @property \Illuminate\Support\Carbon|null $synced_at
 * @property string|null $auto_backup_state default automatic-backup schedule decision: null undecided | scheduled | skipped | failed
 * @property \Illuminate\Support\Carbon|null $auto_backup_attempted_at first failed attempt to create it
 * @property \Illuminate\Support\Carbon|null $panel_created_at when this panel asked the Engine to create the project; null for a project it only mirrors
 *
 * The deploy-log relations (legacy-owned) left with the panel deploy history:
 * the history is the Engine's. The label relation is this model's own.
 */
class Application extends Model
{
    public const string TYPE_WORDPRESS = 'wordpress';

    public const string TYPE_CUSTOM = 'custom';

    /**
     * The Engine `details.deploy_platform` of a project deployed from the
     * panel archive: the `id` of `.panelalpha/panelalpha.yaml`, the file every
     * edition's archive carries. `panelalpha-v1` is the id before the rename;
     * the Engine records the id at each deploy, so a panel not redeployed since
     * still carries it.
     *
     * @var list<string>
     */
    private const array PANEL_DEPLOY_PLATFORMS = ['panelalpha-single-server', 'panelalpha-v1'];

    protected $fillable = [
        'engine_id',
        'engine_project_id',
        'engine_username',
        'name',
        'site_name',
        'domain',
        'status',
        'type',
        'screenshot_time',
        'git_source',
        'git_last_commit_hash',
        'git_last_commit_message',
        'git_last_commit_at',
        'git_provider',
        'git_token',
        'git_webhook_id',
        'git_delivery_imported_at',
        'git_delivery_imported_keys',
        'staging_of_id',
        'staging_creating_at',
        'staging_create_failed_at',
        'onboarding_files_at',
        'onboarding_at', // classic onboarding (a controller column)
        'replacing_at', // classic onboarding (a controller column)
        'engine_payload',
        'engine_created_at',
        'synced_at',
        'panel_created_at',
    ];

    /**
     * The provider token must never reach the Client Area or a log line.
     *
     * @var list<string>
     */
    protected $hidden = ['git_token'];

    protected function casts(): array
    {
        return [
            'dns_alerts_enabled' => 'boolean',
            'engine_id' => 'integer',
            'engine_project_id' => 'integer',
            'engine_payload' => 'array',
            'engine_created_at' => 'datetime',
            'synced_at' => 'datetime',
            'panel_created_at' => 'datetime',
            'auto_backup_attempted_at' => 'datetime',
            'staging_creating_at' => 'datetime',
            'staging_create_failed_at' => 'datetime',
            'onboarding_files_at' => 'datetime',
            'onboarding_at' => 'datetime', // classic onboarding
            'replacing_at' => 'datetime', // classic onboarding
            'git_delivery_imported_at' => 'datetime',
            'git_last_commit_at' => 'datetime',
            'git_delivery_imported_keys' => 'array',
            // Encrypted at rest with APP_KEY, decrypted on read only.
            'git_token' => 'encrypted',
        ];
    }

    /**
     * @return BelongsTo<Application, $this>
     */
    public function stagingOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'staging_of_id');
    }

    /**
     * @return HasMany<Application, $this>
     */
    public function stagings(): HasMany
    {
        return $this->hasMany(self::class, 'staging_of_id');
    }

    /**
     * Panel-owned WordPress async rows (plugin/theme/core), eager-loaded by
     * ProjectPresenter so a list stays one query.
     *
     * @return HasMany<WordPressAsyncStatus, $this>
     */
    public function wordpressAsyncStatuses(): HasMany
    {
        return $this->hasMany(WordPressAsyncStatus::class);
    }

    /**
     * The panel's "Install WordPress" state, if any.
     *
     * @return HasOne<WordPressInstall, $this>
     */
    public function wordpressInstall(): HasOne
    {
        return $this->hasOne(WordPressInstall::class);
    }

    /**
     * The directory the panel installed WordPress into, below the main domain's
     * document root: '' for the document root itself, null when the panel
     * installed none on this project. A staging copy has no install of its own
     * and carries the live project's, subdirectory included.
     */
    public function wordpressDirectory(): ?string
    {
        $install = $this->wordpressInstall ?? $this->liveWordpressInstall();

        return $install === null ? null : trim(Payload::string($install->params['dir'] ?? ''), '/');
    }

    /**
     * The live project's install, for a staging copy: the copy is the same files
     * and database, so its WordPress sits where the live project's does.
     */
    private function liveWordpressInstall(): ?WordPressInstall
    {
        $live = $this->isStaging() ? $this->stagingOf : null;

        return $live instanceof self && ! $live->isStaging() ? $live->wordpressInstall : null;
    }

    /**
     * The Engine `path` of the WordPress install the panel made, for the `wp/*`
     * endpoints (relative to the project home); null when the panel installed
     * no WordPress into a subdirectory, so those calls keep the Engine's default
     * document root.
     */
    public function wordpressInstallPath(): ?string
    {
        return app(DocumentRootResolver::class)->wordpressInstallPath($this);
    }

    /**
     * The WordPress site import that fills this project (Engine 2.2.0), if any.
     *
     * @return HasOne<WordPressImport, $this>
     */
    public function wordpressImport(): HasOne
    {
        return $this->hasOne(WordPressImport::class);
    }

    /**
     * The project's panel-only labels (title/color copied on attach), eager-
     * loaded by ProjectPresenter so a list stays one label query.
     * A Client Area relation; legacy registered it dynamically before.
     *
     * @return HasMany<ApplicationLabel, $this>
     */
    public function applicationLabels(): HasMany
    {
        return $this->hasMany(ApplicationLabel::class);
    }

    public function isStaging(): bool
    {
        return $this->staging_of_id !== null;
    }

    /**
     * Hide the panel's own Engine project and every other project that runs a
     * panel from every read, so a route bound to one answers 404 like an
     * unknown project.
     *
     * @param  Builder<Application>  $query
     * @return Builder<Application>
     */
    public function scopeExcludingSelf(Builder $query): Builder
    {
        $self = SelfProject::username();

        if ($self !== null) {
            $query->where('engine_username', '!=', $self);
        }

        return $query
            ->where(static fn (Builder $q): Builder => $q
                ->whereNull('engine_payload->details->deploy_platform')
                ->orWhereNotIn('engine_payload->details->deploy_platform', self::PANEL_DEPLOY_PLATFORMS))
            ->where(static fn (Builder $q): Builder => $q
                ->whereNull('engine_payload->details->env_override_keys')
                ->orWhereJsonDoesntContain('engine_payload->details->env_override_keys', 'PANELALPHA_SELF_PROJECT'));
    }

    /**
     * The stored provider token, or null when it cannot be decrypted (a changed
     * APP_KEY makes the ciphertext unreadable). Callers treat it as "no token"
     * instead of failing with a 500.
     */
    public function gitToken(): ?string
    {
        // The current attributes, not getRawOriginal: an in-memory change set
        // on the model (but not saved) must be usable too. The
        // value stays ciphertext because the encrypted cast's decrypt happens
        // below, so a changed APP_KEY lands in the catch.
        $attributes = $this->getAttributes();
        $value = $attributes['git_token'] ?? null;
        if (! is_string($value) || $value === '') {
            return null;
        }

        try {
            // Same call as the `encrypted` cast, so a changed APP_KEY lands in
            // the catch instead of a 500.
            $token = Payload::nullableString(static::currentEncrypter()->decrypt($value, false));
        } catch (DecryptException) {
            return null;
        }

        return $token !== null && $token !== '' ? $token : null;
    }

    /**
     * The project's first public IPv4, `config.ip_addresses.ipv4[0]` of the
     * Engine `UserResource` (old `ServerAccount::getIpAddress()`,
     * `PanelAlpha/Account::getIPAddresses()`). Only a real IPv4 literal is used:
     * the mirror value is untrusted, and anything else would pin the probe to a
     * wrong target. null until the first sync carried a valid
     * Engine config.
     */
    public function publicIp(): ?string
    {
        $payload = is_array($this->engine_payload) ? $this->engine_payload : [];
        $config = Payload::object($payload['config'] ?? []);
        $addresses = Payload::object($config['ip_addresses'] ?? []);
        $ips = Payload::strings($addresses['ipv4'] ?? []);

        foreach ($ips as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
                return $ip;
            }
        }

        return null;
    }

    /**
     * The account's MySQL name prefix (`details.mysql_prefix` of the Engine
     * `UserResource`, `User::getMysqlPrefix()`), '' when the mirror has none.
     * The Engine prepends it on create/rename, so the panel compares the CA's
     * unprefixed name against a prefixed one through it.
     */
    public function mysqlPrefix(): string
    {
        $payload = is_array($this->engine_payload) ? $this->engine_payload : [];

        $details = Payload::object($payload['details'] ?? []);
        $prefix = Payload::nullableString($details['mysql_prefix'] ?? null);
        if ($prefix !== null && $prefix !== '') {
            return $prefix;
        }

        $config = Payload::object($payload['config'] ?? []);

        return Payload::nullableString($config['mysql_prefix'] ?? null) ?? '';
    }

    /**
     * The domain the Client Area shows: the mirrored Engine domain without a
     * leading `www.`, as the old panel stored it (`Helper::removeWwwPrefix`).
     * `domain` keeps the Engine's name, `url()` keeps the host
     * the Engine serves, and nothing sent to the Engine uses this value.
     */
    public function presentedDomain(): ?string
    {
        return PresentedDomain::of($this->domain);
    }

    /**
     * The Engine's name for a domain the Client Area sent back: the presented
     * main domain (`presentedDomain()`) is the mirrored one; any
     * other name is returned unchanged.
     */
    public function engineDomainName(string $domain): string
    {
        $mirrored = (string) ($this->domain ?? '');

        return $domain !== $mirrored && $domain === $this->presentedDomain() ? $mirrored : $domain;
    }

    /**
     * The site's public URL from the mirrored domain.
     */
    public function url(): string
    {
        $domain = (string) ($this->domain ?? '');

        return $domain === '' ? '' : 'https://'.$domain;
    }

    /**
     * The project's git repository URL, when the Engine mirror recorded one
     * (details.git_repo, else the git `source` an Engine 2.3.0 reports, which
     * also covers a checkout connected with git/connect). null = a files
     * (archive) project.
     */
    public function gitRepositoryUrl(): ?string
    {
        $details = Payload::object(($this->engine_payload ?? [])['details'] ?? []);
        $repo = Payload::nullableString($details['git_repo'] ?? null);
        if ($repo !== null && $repo !== '') {
            return $repo;
        }

        $source = $this->engineSource();
        $url = ($source['type'] ?? null) === 'git' ? Payload::nullableString($source['url'] ?? null) : null;
        if ($url !== null && $url !== '') {
            return $url;
        }

        return is_string($this->git_source) && $this->git_source !== '' ? $this->git_source : null;
    }

    /**
     * Where the project deploys from, as an Engine 2.3.0 reports it on a
     * project read (`source`: `{type: git, url, branch, auth, rebuild}`,
     * `{type: archive, …}`, `{type: project, from}`, `{type: wordpress}` or
     * `{type: none}`; Engine `ProjectSourceView`). [] from an older Engine. A
     * project deployed through `deploy-archive` or `rebuild {zip_path}`
     * reports `none`, so read it beside `details`, never instead of them.
     *
     * @return array<string, mixed>
     */
    public function engineSource(): array
    {
        return Payload::object(($this->engine_payload ?? [])['source'] ?? null);
    }

    /**
     * The last commit the panel deployed (panel-owned).
     */
    public function gitLastCommitHash(): ?string
    {
        return is_string($this->git_last_commit_hash) && $this->git_last_commit_hash !== ''
            ? $this->git_last_commit_hash
            : null;
    }

    /**
     * The message of the last deployed commit, when the Engine's git log had it.
     */
    public function gitLastCommitMessage(): ?string
    {
        return is_string($this->git_last_commit_message) && $this->git_last_commit_message !== ''
            ? $this->git_last_commit_message
            : null;
    }

    /**
     * The time of the last deployed commit, when the Engine's git log had it.
     */
    public function gitLastCommitAt(): ?Carbon
    {
        $at = $this->git_last_commit_at;

        return $at instanceof Carbon ? $at : null;
    }

    /**
     * The git branch the project currently tracks, when known.
     */
    public function gitBranch(): ?string
    {
        $details = Payload::object(($this->engine_payload ?? [])['details'] ?? []);
        $branch = Payload::nullableString($details['git_branch'] ?? null);
        if ($branch !== null && $branch !== '') {
            return $branch;
        }

        $source = $this->engineSource();
        $branch = ($source['type'] ?? null) === 'git' ? Payload::nullableString($source['branch'] ?? null) : null;

        return $branch !== null && $branch !== '' ? $branch : null;
    }

    /**
     * A staging whose copy is still being watched or was seen failing: the
     * synchronizer keeps such a row after the Engine dropped the destination,
     * so the CA's retry/delete menu works.
     */
    public function stagingCreationPending(): bool
    {
        return $this->isStagingCreating() || $this->staging_create_failed_at !== null;
    }

    /**
     * Whether the Engine copy may still be running. A `staging_creating_at`
     * older than the watcher's cap plus its maximum backoff is stale (the
     * watcher was lost), so it is ignored: the row may be deleted on the Engine,
     * retried or dropped by a sync like any other staging.
     */
    public function isStagingCreating(): bool
    {
        return $this->staging_creating_at !== null
            && $this->staging_creating_at->gt(now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS));
    }

    /**
     * The Engine project kind: a container (DinD) project
     * when the Engine template is `dind` or the project deploys from git.
     */
    public function isContainer(): bool
    {
        // Never the panel's own `git_source` column (a classic site_git connect
        // sets it) – the Engine's `details.template`/`details.git_repo`.
        $details = ($this->engine_payload ?? [])['details'] ?? [];
        if (! is_array($details)) {
            return false;
        }

        // A git or archive source deploys only into a container project
        // (Engine 2.3.0 `CreateShape::impliedRuntime`).
        return ($details['template'] ?? null) === 'dind'
            || (isset($details['git_repo']) && is_string($details['git_repo']) && $details['git_repo'] !== '')
            || in_array($this->engineSource()['type'] ?? null, ['git', 'archive'], true);
    }

    /**
     * Whether the Engine's `protected` setting is on for this project:
     * the mirrored project resource carries it as a boolean (Engine
     * `Http/Resources/UserResource.php:34`). Anything else – an older Engine
     * without the key, a malformed value – reads as not protected; the Engine's
     * 409 still refuses a call the mirror let through.
     */
    public function isProtected(): bool
    {
        return (($this->engine_payload ?? [])['protected'] ?? null) === true;
    }

    /**
     * Whether this project runs a panel itself (this one or another panel's).
     */
    public function isPanelInstallation(): bool
    {
        return self::payloadRunsPanel(is_array($this->engine_payload) ? $this->engine_payload : []);
    }

    /**
     * Whether an Engine project resource runs a panel, whatever way it was
     * installed: a project deployed from the panel archive runs the archive's
     * platform (the `.panelalpha/panelalpha.yaml` id, old or new) and a
     * deploy through `pae` leaves the `PANELALPHA_SELF_PROJECT` override of
     * the panel's own project in `details.env_override_keys`.
     *
     * @param  array<string, mixed>  $project  a `GET /projects/all` UserResource item
     */
    public static function payloadRunsPanel(array $project): bool
    {
        $details = Payload::object($project['details'] ?? []);

        return in_array(Payload::nullableString($details['deploy_platform'] ?? null), self::PANEL_DEPLOY_PLATFORMS, true)
            || in_array('PANELALPHA_SELF_PROJECT', Payload::strings($details['env_override_keys'] ?? []), true);
    }

    /**
     * Home-relative directory the CA's archive uploads are staged in before an
     * archive deploy reads them. The home root is `root:root` and
     * the Engine checks the archive as its own PHP user (`www-data`), which
     * cannot traverse the account's 0700 `~/.panelalpha`; the container
     * project's account-owned `project/` directory (Engine
     * `Dind/Source/ProjectTree.php:19`, 0755) is world-traversable. Null for a
     * classic project: the Engine's archive deploy is Dind-only, so uploading
     * there would stage an archive the deploy never reads – the caller answers
     * the old-style 422 before writing anything (Engine
     * `deploy-archive` `UserController.php:892-898`, `Project::rebuildFromSource()`
     * ignores `zip_path` for a classic project, `System/Project.php:462-478`).
     */
    public function archiveUploadDir(): ?string
    {
        if (! $this->isContainer()) {
            return null;
        }

        return 'project/.panelalpha-upload';
    }

    /**
     * Unix time of the last refreshed thumbnail – a panel-owned value.
     * 0 = never, which the CA renders as "no screenshot".
     */
    public function screenshotTime(): int
    {
        return (int) $this->screenshot_time;
    }

    /**
     * Client for the Engine hosting this application.
     */
    public function engine(): EngineClient
    {
        return app(EngineResolver::class)->forEngine($this->engine_id);
    }

    /**
     * This project as the Engine client takes it: the `Api` methods receive
     * the Engine id, the Engine username and the mirrored facts they check
     * before a call, never the panel model.
     */
    public function engineProject(): EngineProject
    {
        return new EngineProject($this->engine_id, $this->engine_username, $this->isProtected(), $this->domain);
    }
}
