<?php

namespace PanelAlpha\Community\Hub;

use Closure;
use Illuminate\Support\Facades\Log;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubConnectedUser;
use PanelAlpha\Hub\HubPairing;
use Throwable;

/**
 * An approved Hub answer turned into the panel's pairing: a connect-request
 * poll (contract 1.4) and an install-code claim (1.7) answer the same shape.
 * The setup wizard's Connect step and `hub:claim-install-code` share it, so
 * both store the pairing and send the first report the same way.
 */
final class HubActivation
{
    public function __construct(
        private readonly HubClient $hub,
        private readonly HubPairing $pairing,
    ) {}

    /**
     * What stores the pairing when called; null for an answer without the
     * server id or secret, which nothing can be stored from. The approving Hub
     * user's id goes with it: Hub sign-in then takes only their tickets.
     *
     * @param  array<string, mixed>  $answer
     * @return (Closure(): void)|null
     */
    public function storer(array $answer, ?string $adminUrl): ?Closure
    {
        $serverId = Payload::string($answer['server_id'] ?? null);
        $secret = Payload::string($answer['server_secret'] ?? null);
        if ($serverId === '' || $secret === '') {
            return null;
        }

        $account = Payload::object($answer['account'] ?? null);
        $hubUrl = Payload::string($answer['hub_url'] ?? null);
        // Origin only: the report is signed over a path without any base path (contract §6).
        $hubUrl = HubClient::isHubUrl($hubUrl) ? HubClient::origin($hubUrl) : '';
        $hubUserId = HubConnectedUser::fromAnswer($answer)?->id;

        return fn () => $this->pairing->store(
            $serverId,
            $secret,
            $hubUrl !== '' ? $hubUrl : config()->string('hub.url'),
            Payload::nullableString($account['name'] ?? null),
            $adminUrl,
            $hubUserId === null ? null : (string) $hubUserId,
        );
    }

    /**
     * The pairing stored, then its first report, inside the caller's setup
     * transaction: a 401 on that report makes the client forget the pairing,
     * and PairingRejected rolls the setup back so no admin is left on an
     * unpaired panel.
     *
     * @param  Closure(): void  $store
     * @return bool whether the first report went through
     *
     * @throws PairingRejected
     */
    public function storeAndReport(Closure $store): bool
    {
        $store();
        $reported = $this->sendFirstReport();
        if (! $this->pairing->isPaired()) {
            throw new PairingRejected;
        }

        return $reported;
    }

    /**
     * The Hub treats the panel as connected from its first signed report. A
     * network or 5xx failure is not fatal: the scheduled report retries.
     */
    public function sendFirstReport(): bool
    {
        try {
            return $this->hub->report()->successful();
        } catch (Throwable $e) {
            Log::warning('PanelAlpha Hub first report failed', ['exception' => $e::class]);

            return false;
        }
    }
}
