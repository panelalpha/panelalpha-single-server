<?php

namespace PanelAlpha\Community\Mail;

use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Mail\MailManager;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\TransportInterface;

/**
 * The panel's own mail through the Engine's relay. The Engine hands every
 * account `PA_SMTP_HOST`/`PA_SMTP_PORT`, the mail server on its host;
 * `config/mail.php` makes that the panel's mailer. Here it is sent without a
 * user name and without TLS in any form - the hop never leaves the server,
 * and the relay's certificate is its own - and addressed from `no-reply@` at
 * the panel's host (`APP_URL`) as the server name in Settings > General, so a
 * relayed message does not claim to come from `hello@example.com` or from
 * "Laravel". Without the relay address the host's mailer stays as it is, so an
 * install the Engine does not hand one sends nothing.
 *
 * Both are set when the mail manager resolves a mailer, not at boot: an
 * install that sends no mail pays no settings read.
 */
final class EngineMailRelay
{
    /** The mailer `config/mail.php` configures for the Engine's relay. */
    public const string MAILER = 'relay';

    /** The transport of that mailer. */
    public const string TRANSPORT = 'engine-relay';

    /** Settings > General's name until the owner sets one (`SettingsController`). */
    private const string DEFAULT_NAME = 'My Server';

    public static function register(MailManager $manager): void
    {
        $manager->extend(self::TRANSPORT, static fn (array $config): TransportInterface => self::transport($config));
    }

    /**
     * @param  array<array-key, mixed>  $config
     */
    public static function transport(array $config): EsmtpTransport
    {
        $transport = new EsmtpTransport(
            Payload::string($config['host'] ?? ''),
            (int) Payload::string($config['port'] ?? ''),
            false,
        );
        // `false` above only drops implicit TLS; the relay advertises STARTTLS
        // with a certificate for its own name, which must not be tried.
        $transport->setAutoTls(false);

        $domain = Payload::string($config['local_domain'] ?? '');
        if ($domain !== '') {
            $transport->setLocalDomain($domain);
        }

        return $transport;
    }

    public static function apply(Application $app): void
    {
        $config = $app->make(Repository::class);
        if ($config->get('mail.default') !== self::MAILER) {
            return;
        }

        $config->set('mail.from', [
            'address' => 'no-reply@'.self::panelHost(),
            'name' => Payload::string($app->make(PanelSettings::class)->get('userapp.name')) ?: self::DEFAULT_NAME,
        ]);
    }

    /**
     * The panel's own host, the one APP_URL names.
     */
    private static function panelHost(): string
    {
        $host = parse_url(Payload::string(config('app.url')), PHP_URL_HOST);

        return is_string($host) && $host !== '' ? $host : 'localhost';
    }
}
