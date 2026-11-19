<?php

namespace Tests\Unit\Packages\Hub;

use PanelAlpha\Hub\HubConnectedUser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The Hub user read from an approved connect-request answer.
 */
final class HubConnectedUserTest extends TestCase
{
    public function test_a_full_user_is_read_with_a_lowercase_email(): void
    {
        $user = HubConnectedUser::fromAnswer(['user' => ['id' => 128, 'email' => ' Ada@Example.com ', 'name' => ' Ada Lovelace ']]);

        $this->assertNotNull($user);
        $this->assertSame(128, $user->id);
        $this->assertSame('ada@example.com', $user->email);
        $this->assertSame('Ada Lovelace', $user->name);
    }

    public function test_an_empty_name_becomes_the_part_before_the_at_sign(): void
    {
        $user = HubConnectedUser::fromAnswer(['user' => ['email' => 'grace@example.com', 'name' => '  ']]);

        $this->assertSame('grace', $user?->name);
    }

    public function test_an_id_that_is_not_an_integer_is_dropped(): void
    {
        $this->assertNull(HubConnectedUser::fromAnswer(['user' => ['id' => '128', 'email' => 'a@example.com']])?->id);
        $this->assertNull(HubConnectedUser::fromAnswer(['user' => ['id' => 1.5, 'email' => 'a@example.com']])?->id);
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function unusableAnswers(): array
    {
        return [
            'no user key' => [[]],
            'user is null' => [['user' => null]],
            'user is a string' => [['user' => 'ada']],
            'no email' => [['user' => ['id' => 1, 'name' => 'Ada']]],
            'email is a number' => [['user' => ['email' => 12]]],
            'empty email' => [['user' => ['email' => '  ']]],
            'not an email' => [['user' => ['email' => 'ada']]],
            'email over 255 characters' => [['user' => ['email' => str_repeat('a', 250).'@example.com']]],
        ];
    }

    /**
     * @param  array<string, mixed>  $answer
     */
    #[DataProvider('unusableAnswers')]
    public function test_an_answer_without_a_usable_user_gives_none(array $answer): void
    {
        $this->assertNull(HubConnectedUser::fromAnswer($answer));
    }
}
