<?php

namespace Tests\Feature\Community;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\MailManager;
use Illuminate\Mail\Transport\ArrayTransport;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;
use Symfony\Component\Mime\Email;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The panel's own mail through the Engine's relay (Engine #2379): the Engine
 * hands the account `PA_SMTP_HOST`/`PA_SMTP_PORT`, `config/mail.php` makes the
 * relay the mailer, and the panel sends from `no-reply@<the APP_URL host>` as
 * the server name. Without the address the host's mailer stays as it is.
 */
final class EngineMailRelayTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The environment the test suite found, restored after each test so a
     * value cannot leak into the next one.
     *
     * @var array<string, array{putenv: string|false, env: string|null, server: string|null}>
     */
    private array $environment = [];

    protected function tearDown(): void
    {
        foreach ($this->environment as $name => $previous) {
            $previous['putenv'] === false ? putenv($name) : putenv($name.'='.$previous['putenv']);
            if ($previous['env'] === null) {
                unset($_ENV[$name]);
            } else {
                $_ENV[$name] = $previous['env'];
            }
            if ($previous['server'] === null) {
                unset($_SERVER[$name]);
            } else {
                $_SERVER[$name] = $previous['server'];
            }
        }

        parent::tearDown();
    }

    private function env(string $name, ?string $value): void
    {
        if (! array_key_exists($name, $this->environment)) {
            $this->environment[$name] = [
                'putenv' => getenv($name),
                'env' => $_ENV[$name] ?? null,
                'server' => $_SERVER[$name] ?? null,
            ];
        }

        if ($value === null) {
            putenv($name);
            unset($_ENV[$name], $_SERVER[$name]);

            return;
        }

        putenv($name.'='.$value);
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }

    /**
     * The mail configuration of a boot with this environment, and the mail
     * manager as the next request or job builds it (the provider's
     * after-resolving step applies the sender).
     */
    private function mailManagerWithEnv(?string $relayHost, ?string $relayPort): MailManager
    {
        $this->env('PA_SMTP_HOST', $relayHost);
        $this->env('PA_SMTP_PORT', $relayPort);
        config()->set('mail', require base_path('config/mail.php'));

        $this->app->forgetInstance('mail.manager');

        /** @var MailManager $manager */
        $manager = $this->app->make(MailManager::class);

        return $manager;
    }

    public function test_the_engine_relay_carries_the_panels_mail_when_the_engine_hands_it(): void
    {
        app(PanelSettings::class)->set('userapp.name', 'Office box');
        config()->set('app.url', 'https://panel.example.test');
        // `config/mail.php` reads APP_URL from the env, as phpdotenv hands it to
        // a real boot; `app.url` is the config that boot already resolved.
        $this->env('APP_URL', 'https://panel.example.test');

        $mailer = $this->mailManagerWithEnv(TestNetwork::PRIVATE_172, '2525')->mailer();

        $this->assertSame('relay', config()->string('mail.default'));
        $this->assertSame('engine-relay', config()->string('mail.mailers.relay.transport'));
        $this->assertSame(TestNetwork::PRIVATE_172, config()->string('mail.mailers.relay.host'));
        $this->assertSame(2525, (int) config()->get('mail.mailers.relay.port'));
        // The hop stays on the server: no credentials and no TLS.
        $this->assertNull(config()->get('mail.mailers.relay.username'));
        $this->assertNull(config()->get('mail.mailers.relay.password'));
        $this->assertNull(config()->get('mail.mailers.relay.scheme'));

        // The relay's own certificate must never be tried: no implicit TLS and
        // no STARTTLS upgrade.
        $relay = $mailer->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $relay);
        $this->assertFalse($relay->isAutoTls());
        $stream = $relay->getStream();
        $this->assertInstanceOf(SocketStream::class, $stream);
        $this->assertFalse($stream->isTLS());
        $this->assertSame(TestNetwork::PRIVATE_172, $stream->getHost());
        $this->assertSame(2525, $stream->getPort());
        $this->assertSame('panel.example.test', $relay->getLocalDomain());

        // The mailer the manager resolved carries that sender, so the message
        // itself names the panel's host and the server name.
        $transport = new ArrayTransport;
        $mailer->setSymfonyTransport($transport);
        $mailer->raw('probe', fn ($message) => $message->to('owner@example.com')->subject('probe'));
        $email = $transport->messages()->first()?->getOriginalMessage();
        $this->assertInstanceOf(Email::class, $email);
        $this->assertCount(1, $email->getFrom());
        $this->assertSame('no-reply@panel.example.test', $email->getFrom()[0]->getAddress());
        $this->assertSame('Office box', $email->getFrom()[0]->getName());
    }

    public function test_the_relay_port_defaults_to_the_mail_port(): void
    {
        $this->mailManagerWithEnv(TestNetwork::PRIVATE_172, null);

        $this->assertSame(25, (int) config()->get('mail.mailers.relay.port'));
    }

    public function test_a_relay_without_a_server_name_names_the_panel_as_my_server(): void
    {
        app(PanelSettings::class)->forget('userapp.name');
        config()->set('app.url', 'https://panel.example.test');

        $this->mailManagerWithEnv(TestNetwork::PRIVATE_172, '25');

        $this->assertSame(['address' => 'no-reply@panel.example.test', 'name' => 'My Server'], config()->get('mail.from'));
    }

    public function test_without_a_relay_address_the_panels_mailer_is_unchanged(): void
    {
        $default = config()->string('mail.default');
        $from = config()->get('mail.from');

        $this->mailManagerWithEnv(null, null);

        $this->assertSame($default, config()->string('mail.default'), 'an install without a relay keeps the host mailer');
        $this->assertSame($from, config()->get('mail.from'));
        $this->assertSame('', config()->get('mail.mailers.relay.host'));
    }

    public function test_an_empty_relay_address_does_not_switch_the_mailer(): void
    {
        $default = config()->string('mail.default');

        $this->mailManagerWithEnv('', '25');

        $this->assertSame($default, config()->string('mail.default'));
    }
}
