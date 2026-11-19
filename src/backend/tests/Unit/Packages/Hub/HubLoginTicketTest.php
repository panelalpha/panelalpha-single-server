<?php

namespace Tests\Unit\Packages\Hub;

use PanelAlpha\Hub\HubLoginTicket;
use PanelAlpha\Hub\HubPairing;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Verification of a Hub login ticket (PANEL-LOGIN-CONTRACT.md 2.2 and 2.3):
 * every failed check gives null and a reason for the log, never the ticket.
 */
final class HubLoginTicketTest extends TestCase
{
    private const HUB = 'https://hub.example.test';

    private const SECRET = 'the-server-secret';

    private HubPairing $pairing;

    private HubLoginTicket $verifier;

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->pairing = new HubPairing(new InMemoryHubSettings);
        $this->pairing->store('srv_1', self::SECRET, self::HUB, 'Acme');
        $this->verifier = new HubLoginTicket($this->pairing);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $header
     */
    private function ticket(array $claims = [], array $header = ['alg' => 'HS256', 'typ' => 'JWT'], string $secret = self::SECRET): string
    {
        $claims += [
            'iss' => self::HUB,
            'aud' => 'srv_1',
            'sub' => '128',
            'email' => 'ada@example.com',
            'name' => 'Ada',
            'jti' => 'jti-0123456789abcdef-'.bin2hex(random_bytes(4)),
            'iat' => time(),
            'exp' => time() + 60,
        ];
        $claims = array_filter($claims, static fn (mixed $value): bool => $value !== '__unset__');

        $head = self::b64(json_encode($header, JSON_THROW_ON_ERROR));
        $body = self::b64(json_encode($claims, JSON_THROW_ON_ERROR));

        return $head.'.'.$body.'.'.self::b64(hash_hmac('sha256', $head.'.'.$body, $secret, true));
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public function test_a_valid_ticket_gives_its_claims(): void
    {
        $claims = $this->verifier->verify($this->ticket(['name' => 'Ada Lovelace']), null);

        $this->assertIsArray($claims);
        $this->assertSame('128', $claims['sub']);
        $this->assertSame('ada@example.com', $claims['email']);
        $this->assertSame('Ada Lovelace', $claims['name']);
        $this->assertNull($this->verifier->lastFailure);
    }

    public function test_a_ticket_started_on_the_panel_needs_the_same_state(): void
    {
        $this->assertIsArray($this->verifier->verify($this->ticket(['state' => 'abc']), 'abc'));
    }

    public function test_the_issuer_may_differ_by_a_trailing_slash(): void
    {
        $this->assertIsArray($this->verifier->verify($this->ticket(['iss' => self::HUB.'/']), null));
    }

    public function test_a_ticket_just_past_its_expiry_still_passes_within_the_clock_tolerance(): void
    {
        $this->assertIsArray($this->verifier->verify($this->ticket(['exp' => time() - HubLoginTicket::CLOCK_TOLERANCE + 5]), null));
        $this->assertIsArray($this->verifier->verify($this->ticket(['iat' => time() + HubLoginTicket::CLOCK_TOLERANCE - 5]), null));
    }

    public function test_the_failure_is_reset_by_the_next_good_ticket(): void
    {
        $this->assertNull($this->verifier->verify('nonsense', null));
        $this->assertSame('malformed', $this->verifier->lastFailure);

        $this->assertIsArray($this->verifier->verify($this->ticket(), null));
        $this->assertNull($this->verifier->lastFailure);
    }

    public function test_an_unpaired_panel_accepts_nothing(): void
    {
        $ticket = $this->ticket();
        $this->pairing->forget();

        $this->assertNull($this->verifier->verify($ticket, null));
        $this->assertSame('not_paired', $this->verifier->lastFailure);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function malformedTickets(): array
    {
        return [
            'empty' => ['', 'malformed'],
            'one part' => ['abc', 'malformed'],
            'two parts' => ['a.b', 'malformed'],
            'four parts' => ['a.b.c.d', 'malformed'],
            'parts that are not base64' => ['!!!.@@@.###', 'malformed'],
            'parts that are not json' => [self::b64('nope').'.'.self::b64('nope').'.'.self::b64('sig'), 'malformed'],
            'a header that is not an object' => [self::b64('"x"').'.'.self::b64('{}').'.'.self::b64('sig'), 'malformed'],
        ];
    }

    #[DataProvider('malformedTickets')]
    public function test_a_ticket_that_is_not_a_jwt_is_refused(string $ticket, string $reason): void
    {
        $this->assertNull($this->verifier->verify($ticket, null));
        $this->assertSame($reason, $this->verifier->lastFailure);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>, 2: string, 3: string}>
     */
    public static function refusedTickets(): array
    {
        return [
            'alg none' => [[], ['alg' => 'none'], self::SECRET, 'alg'],
            'alg HS512' => [[], ['alg' => 'HS512'], self::SECRET, 'alg'],
            'no alg' => [[], [], self::SECRET, 'alg'],
            'signed with another secret' => [[], ['alg' => 'HS256'], 'another-secret', 'signature'],
            'another issuer' => [['iss' => 'https://hub.evil.test'], ['alg' => 'HS256'], self::SECRET, 'iss'],
            'no issuer' => [['iss' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'iss'],
            'another audience' => [['aud' => 'srv_2'], ['alg' => 'HS256'], self::SECRET, 'aud'],
            'an audience that is a number' => [['aud' => 1], ['alg' => 'HS256'], self::SECRET, 'aud'],
            'no subject' => [['sub' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'sub'],
            'an empty subject' => [['sub' => ''], ['alg' => 'HS256'], self::SECRET, 'sub'],
            'a subject that is a number' => [['sub' => 128], ['alg' => 'HS256'], self::SECRET, 'sub'],
            'no email' => [['email' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'email'],
            'an email that is not an address' => [['email' => 'ada'], ['alg' => 'HS256'], self::SECRET, 'email'],
            'an email that is a number' => [['email' => 5], ['alg' => 'HS256'], self::SECRET, 'email'],
            'expired beyond the tolerance' => [['exp' => 1], ['alg' => 'HS256'], self::SECRET, 'expired'],
            'no expiry' => [['exp' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'expired'],
            'an expiry that is a string' => [['exp' => '9999999999'], ['alg' => 'HS256'], self::SECRET, 'expired'],
            'issued in the future' => [['iat' => PHP_INT_MAX - 100], ['alg' => 'HS256'], self::SECRET, 'iat_future'],
            'no issue time' => [['iat' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'iat_future'],
            'valid for longer than five minutes' => [['iat' => time(), 'exp' => time() + HubLoginTicket::MAX_LIFETIME + 1], ['alg' => 'HS256'], self::SECRET, 'lifetime'],
            'a state the panel never started' => [['state' => 'abc'], ['alg' => 'HS256'], self::SECRET, 'state'],
            'no jti' => [['jti' => '__unset__'], ['alg' => 'HS256'], self::SECRET, 'jti'],
            'a short jti' => [['jti' => 'short'], ['alg' => 'HS256'], self::SECRET, 'jti'],
            'a jti that is a number' => [['jti' => 1234567890123456], ['alg' => 'HS256'], self::SECRET, 'jti'],
        ];
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $header
     */
    #[DataProvider('refusedTickets')]
    public function test_a_ticket_failing_one_check_is_refused_with_its_reason(array $claims, array $header, string $secret, string $reason): void
    {
        $this->assertNull($this->verifier->verify($this->ticket($claims, $header, $secret), null));
        $this->assertSame($reason, $this->verifier->lastFailure);
    }

    public function test_a_ticket_with_a_state_needs_a_session_state_that_matches(): void
    {
        $ticket = fn (): string => $this->ticket(['state' => 'abc']);

        $this->assertNull($this->verifier->verify($ticket(), 'other'));
        $this->assertSame('state', $this->verifier->lastFailure);
        $this->assertNull($this->verifier->verify($ticket(), null));
        $this->assertSame('state', $this->verifier->lastFailure);
    }

    public function test_a_session_state_without_a_ticket_state_is_refused(): void
    {
        $this->assertNull($this->verifier->verify($this->ticket(), 'abc'));
        $this->assertSame('state', $this->verifier->lastFailure);
    }

    public function test_a_ticket_state_that_is_not_a_string_is_refused(): void
    {
        $this->assertNull($this->verifier->verify($this->ticket(['state' => 5]), '5'));
        $this->assertSame('state', $this->verifier->lastFailure);
    }

    public function test_a_ticket_can_be_used_only_once(): void
    {
        $ticket = $this->ticket(['jti' => 'a-unique-jti-0123456789']);

        $this->assertIsArray($this->verifier->verify($ticket, null));
        $this->assertNull($this->verifier->verify($ticket, null));
        $this->assertSame('jti', $this->verifier->lastFailure);
    }

    public function test_a_ticket_that_failed_another_check_is_not_burnt(): void
    {
        $jti = 'a-unique-jti-fedcba9876543210';

        $this->assertNull($this->verifier->verify($this->ticket(['jti' => $jti, 'state' => 'abc']), null));
        $this->assertSame('state', $this->verifier->lastFailure);

        $this->assertIsArray($this->verifier->verify($this->ticket(['jti' => $jti]), null));
    }

    public function test_a_used_jti_is_forgotten_after_five_minutes(): void
    {
        $jti = 'a-unique-jti-0011223344556677';
        $this->assertIsArray($this->verifier->verify($this->ticket(['jti' => $jti]), null));

        $this->travel(HubLoginTicket::JTI_TTL + 1)->seconds();

        $this->assertIsArray($this->verifier->verify($this->ticket(['jti' => $jti, 'iat' => time(), 'exp' => time() + 60]), null));
    }

    public function test_a_used_jti_is_remembered_for_as_long_as_its_ticket_is_valid(): void
    {
        $jti = 'a-unique-jti-8899aabbccddeeff';
        $ticket = $this->ticket(['jti' => $jti, 'iat' => time(), 'exp' => time() + HubLoginTicket::MAX_LIFETIME]);
        $this->assertIsArray($this->verifier->verify($ticket, null));

        // Past the five minutes but before its expiry plus the tolerance: a replay is still refused.
        $this->travel(HubLoginTicket::JTI_TTL + 1)->seconds();

        $this->assertNull($this->verifier->verify($ticket, null));
        $this->assertSame('jti', $this->verifier->lastFailure);
    }

    public function test_a_pairing_that_names_its_hub_user_takes_only_their_tickets(): void
    {
        $this->pairing->store('srv_1', self::SECRET, self::HUB, 'Acme', null, '128');

        $this->assertNull($this->verifier->verify($this->ticket(['sub' => '129']), null));
        $this->assertSame('sub_not_paired_user', $this->verifier->lastFailure);
        $this->assertNull($this->verifier->verify($this->ticket(['sub' => '1280']), null));
        $this->assertSame('sub_not_paired_user', $this->verifier->lastFailure);

        $this->assertIsArray($this->verifier->verify($this->ticket(['sub' => '128']), null));
    }

    public function test_the_signature_is_compared_over_the_exact_signed_text(): void
    {
        $ticket = $this->ticket();
        [$head, $body, $signature] = explode('.', $ticket);
        $tampered = json_decode((string) base64_decode(strtr($body, '-_', '+/')), true);
        $tampered['sub'] = '1';
        $forged = $head.'.'.self::b64(json_encode($tampered, JSON_THROW_ON_ERROR)).'.'.$signature;

        $this->assertNull($this->verifier->verify($forged, null));
        $this->assertSame('signature', $this->verifier->lastFailure);
    }
}
