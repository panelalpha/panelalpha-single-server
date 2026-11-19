<?php

namespace PanelAlpha\Hub;

use Illuminate\Support\Facades\Crypt;
use PanelAlpha\Hub\Contracts\HubSettings;

/**
 * The panel's pairing with PanelAlpha Hub: server_id + server_secret, the Hub
 * and admin origins, the account, the Hub user who approved it and the time it
 * was paired (old `packages/api/app/Lib/Hub/HubPairing.php`). The secret is
 * encrypted at rest and never logged.
 */
final class HubPairing
{
    private const string SERVER_ID = 'hub.server_id';

    private const string SERVER_SECRET = 'hub.server_secret';

    private const string HUB_URL = 'hub.hub_url';

    private const string ACCOUNT_NAME = 'hub.account_name';

    private const string CONNECTED_AT = 'hub.connected_at';

    private const string ADMIN_URL = 'hub.admin_url';

    /** The approving Hub user's id: the only `sub` a login ticket may name once it is stored. */
    private const string HUB_USER_ID = 'hub.user_id';

    public function __construct(private readonly HubSettings $settings) {}

    public function isPaired(): bool
    {
        return $this->value(self::SERVER_ID) !== null && $this->value(self::SERVER_SECRET) !== null;
    }

    public function store(string $serverId, string $serverSecret, string $hubUrl, ?string $accountName, ?string $adminUrl = null, ?string $hubUserId = null): void
    {
        // The id and the secret go last: a failure half way never leaves a paired-looking panel.
        $this->settings->set(self::ADMIN_URL, (string) $adminUrl);
        $this->settings->set(self::HUB_USER_ID, (string) $hubUserId);
        $this->settings->set(self::HUB_URL, rtrim($hubUrl, '/'));
        $this->settings->set(self::ACCOUNT_NAME, (string) $accountName);
        $this->settings->set(self::CONNECTED_AT, now()->toIso8601String());
        $this->settings->set(self::SERVER_ID, $serverId);
        $this->settings->set(self::SERVER_SECRET, Crypt::encryptString($serverSecret));
    }

    /**
     * The panel moved to a new address: the Hub sends browsers there from the
     * next report on. Nothing changes while the panel is not paired.
     */
    public function updateAdminUrl(string $origin): void
    {
        if ($this->isPaired()) {
            $this->settings->set(self::ADMIN_URL, $origin);
        }
    }

    public function forget(): void
    {
        $this->settings->forget(
            self::SERVER_ID,
            self::SERVER_SECRET,
            self::HUB_URL,
            self::ACCOUNT_NAME,
            self::CONNECTED_AT,
            self::ADMIN_URL,
            self::HUB_USER_ID,
        );
    }

    public function serverId(): ?string
    {
        return $this->value(self::SERVER_ID);
    }

    public function serverSecret(): ?string
    {
        $value = $this->value(self::SERVER_SECRET);

        return $value === null ? null : Crypt::decryptString($value);
    }

    /**
     * The Hub user who approved the pairing (a ticket's `sub`), or null for a
     * pairing stored without one.
     */
    public function hubUserId(): ?string
    {
        return $this->value(self::HUB_USER_ID);
    }

    /**
     * The admin origin the panel registered on the Hub, if any.
     */
    public function adminUrl(): ?string
    {
        return $this->value(self::ADMIN_URL);
    }

    public function hubUrl(): string
    {
        return $this->value(self::HUB_URL) ?? rtrim(config()->string('hub.url'), '/');
    }

    /**
     * @return array{paired: bool, hub_url: string, account_name: string|null, connected_at: string|null}
     */
    public function summary(): array
    {
        return [
            'paired' => $this->isPaired(),
            'hub_url' => $this->hubUrl(),
            'account_name' => $this->value(self::ACCOUNT_NAME),
            'connected_at' => $this->value(self::CONNECTED_AT),
        ];
    }

    /**
     * A stored value, null when unset or empty (old `SystemSetting::get() ?: null`).
     */
    private function value(string $name): ?string
    {
        $value = $this->settings->get($name);

        return $value === null || $value === '' || $value === '0' ? null : $value;
    }
}
