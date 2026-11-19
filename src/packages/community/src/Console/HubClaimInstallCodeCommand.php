<?php

namespace PanelAlpha\Community\Console;

use Illuminate\Console\Command;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\Community\Hub\HubActivation;
use PanelAlpha\Community\Hub\InstallCodeInput;
use PanelAlpha\Community\Hub\PairingRejected;
use PanelAlpha\Community\Setup\FirstRunSetup;
use PanelAlpha\Community\Setup\SetupAlreadyDone;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubConnectedUser;
use PanelAlpha\Hub\HubPairing;
use Throwable;

/**
 * The installer's `--hub-code` (contract 1.7): the entrypoint runs this once,
 * at the first boot, with PANELALPHA_HUB_CODE and PANELALPHA_USER_PASSWORD on
 * stdin. One claim, no retry: on the Hub's 200 the admin is created from the
 * Hub user (its email must be `email`), the server name set, the pairing
 * stored and the first report sent, in one transaction, as the setup wizard's
 * Connect step does. Any refusal leaves the panel untouched, so the
 * entrypoint's first-user step still creates the admin from the env vars.
 * The code is never printed or logged.
 */
final class HubClaimInstallCodeCommand extends Command
{
    /** Paired: the admin exists and the Hub has the panel. */
    public const int CONNECTED = 0;

    /** The Hub refused the code, or could not be reached; nothing changed. */
    public const int REFUSED = 2;

    /** A user exists already: the code was not sent. */
    public const int SETUP_DONE = 3;

    protected $signature = 'hub:claim-install-code
                            {email : The admin the install was made for (the installer\'s --email)}';

    protected $description = 'Set the panel up from the installer\'s PanelAlpha Hub code (stdin: the code, then an optional password)';

    /** What the Hub's `error` means to the person who ran the installer. */
    private const array REASONS = [
        'invalid_grant' => 'the code is not valid, was used already, or was made for another email',
        'expired_token' => 'the code has expired; create a new one in PanelAlpha',
        'invalid_address' => 'PanelAlpha needs a public IP address and an https:// address for this panel',
        'wrong_product' => 'the code was made for another kind of panel',
    ];

    public function handle(
        Container $container,
        SetupState $state,
        InstallCodeInput $input,
        HubClient $hub,
        HubActivation $activation,
        HubPairing $pairing,
        HubPanel $panel,
        PanelUrl $panelUrl,
        FirstRunSetup $setup,
        FirstUserCreator $users,
    ): int {
        if (! SingleUserMode::active($container)) {
            $this->error('A Hub install code sets up a single-user panel only.');

            return self::FAILURE;
        }
        if (! $state->required()) {
            $this->line('This panel is set up already; the PanelAlpha code was not used.');

            return self::SETUP_DONE;
        }

        ['code' => $code, 'password' => $password] = $input->read();
        $code = strtoupper($code);
        $email = strtolower(trim(Payload::string($this->argument('email'))));
        if (! preg_match('/^[A-Z0-9-]{1,32}$/', $code)) {
            return $this->refused('the code is missing or not a PanelAlpha code');
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return $this->refused('the email is not valid');
        }

        $adminUrl = HubClient::origin($panelUrl->base());
        try {
            $response = $hub->claimInstallCode($code, $email, $adminUrl);
        } catch (Throwable $e) {
            // The class only: a transport message may carry the request URL.
            Log::warning('PanelAlpha install code claim failed', ['exception' => $e::class]);

            return $this->refused('PanelAlpha could not be reached');
        }
        if ($response->status() !== 200) {
            return $this->refused(self::reason($response));
        }

        $answer = Payload::object($response->json());
        $user = HubConnectedUser::fromAnswer($answer);
        // The Hub checks the email against the code's creator; the panel
        // holds it to the same answer. An unconfirmed pairing expires on the Hub.
        if ($user === null || $user->email !== $email) {
            return $this->refused('PanelAlpha answered for another account');
        }
        // Hub sign-in takes only this user's tickets, so the pairing must name them.
        if ($user->id === null) {
            return $this->refused('PanelAlpha did not say which account the code belongs to');
        }
        $store = $activation->storer($answer, $adminUrl);
        if ($store === null) {
            return $this->refused('PanelAlpha sent an incomplete answer');
        }

        $reported = false;
        try {
            $setup->runUnattended(
                fn () => $password !== ''
                    ? $users->create($user->email, $password, $user->name)
                    : $users->createWithGeneratedPassword($user->email, $user->name),
                $panel->hostname($adminUrl),
                function () use ($activation, $store, &$reported): void {
                    $reported = $activation->storeAndReport($store);
                },
            );
        } catch (SetupAlreadyDone) {
            $this->line('This panel is set up already; the PanelAlpha code was not used.');

            return self::SETUP_DONE;
        } catch (PairingRejected) {
            // The rollback undid the report's own forget; this drops the cached settings.
            $pairing->forget();

            return $this->refused('PanelAlpha did not accept the connection');
        } catch (ValidationException $e) {
            $pairing->forget();

            return $this->refused('the admin could not be created: '.implode(' ', $e->validator->errors()->all()));
        } catch (Throwable $e) {
            // The rollback left no admin; the pairing must not outlive it.
            Log::warning('PanelAlpha install code setup failed', ['exception' => $e::class]);
            $pairing->forget();
            $this->error('The setup could not be finished; see the log.');

            return self::FAILURE;
        }

        Log::info('Connected to PanelAlpha', ['by' => $user->email, 'admin_created' => true, 'via' => 'install code']);
        $this->info($reported
            ? 'Connected to PanelAlpha.'
            : 'Connected to PanelAlpha; the first report will be sent again by the schedule.');

        return self::CONNECTED;
    }

    private function refused(string $reason): int
    {
        Log::warning('PanelAlpha install code not used', ['reason' => $reason]);
        $this->warn("Could not connect to PanelAlpha: {$reason}. Connect later from Settings.");

        return self::REFUSED;
    }

    private static function reason(Response $response): string
    {
        if ($response->status() === 429) {
            return 'too many attempts';
        }
        $error = Payload::string($response->json('error'));

        return self::REASONS[$error] ?? "PanelAlpha refused the code (HTTP {$response->status()})";
    }
}
