<?php

namespace Tests\Unit\ClientArea\Support;

use PanelAlpha\ClientArea\Support\EngineText;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * {@see EngineText::friendly()} turns the known Engine and PHP refusal
 * texts into one plain sentence. A known code decides first; a message pattern
 * is the fallback. Ordinary texts stay untouched.
 */
class EngineTextTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: list<string>, 2: string}>
     */
    public static function friendlyTexts(): array
    {
        return [
            'push while the staging copy is pending' => [
                "Project 'site1' is pending.", [], EngineText::STILL_PREPARING,
            ],
            'pending project code with an unrelated message' => [
                'Something else.', ['project_pending'], EngineText::STILL_PREPARING,
            ],
            'pending target code with an unrelated message' => [
                'Something else.', ['target_pending'], EngineText::STILL_PREPARING,
            ],
            'refused key code with a stderr the pattern does not know' => [
                'fatal: could not read from remote repository.', ['git_ssh_key_refused'], EngineText::SSH_KEY_REFUSED,
            ],
            'refused key, full Engine text' => [
                "git@github.com: Permission denied (publickey).\r\nfatal: Could not read from remote repository. The repository does not accept this project's deploy key: add its public half (POST /projects/site1/git/deploy-key).",
                [],
                EngineText::SSH_KEY_REFUSED,
            ],
            'refused key by stderr alone' => [
                'git@github.com: Permission denied (publickey).', [], EngineText::SSH_KEY_REFUSED,
            ],
            'shared zone certificate, full Engine text' => [
                'Could not obtain a certificate for shop.panelalpha.online: shop.panelalpha.online is under panelalpha.online, a zone every engine in the fleet issues under and shares one 50-certificate weekly limit on. Set shared_zone_issuance to obtain one anyway, or give the project a domain you own',
                [],
                EngineText::SHARED_ZONE_REFUSED,
            ],
            'shared zone setting named alone' => [
                'Set shared_zone_issuance to obtain one anyway.', [], EngineText::SHARED_ZONE_REFUSED,
            ],
            'PHP undefined method' => [
                'Call to undefined method WP_Migration::run()', [], EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'PHP member function on null' => [
                'Call to a member function get() on null', [], EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'PHP fatal error line' => [
                'PHP Fatal error:  Uncaught Error: boom', [], EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'PHP fatal error in a plugin keeps its name' => [
                'PHP Fatal error:  Uncaught Error: boom in /var/www/html/wp-content/plugins/my-plugin/main.php:12',
                [],
                'The plugin "my-plugin" caused an error. Fix or remove it, then try again.',
            ],
            'PHP parse error in a theme keeps its name' => [
                'PHP Parse error:  syntax error in /var/www/html/wp-content/themes/my-theme/functions.php on line 3',
                [],
                'The theme "my-theme" caused an error. Fix or remove it, then try again.',
            ],
            'plugin only in the stack trace gives the generic text' => [
                "PHP Fatal error:  Uncaught Error: Call to a member function run() on null in /var/www/core/Runner.php:9\nStack trace:\n#0 /var/www/html/wp-content/plugins/other-plugin/hook.php(4): Runner->go()\n#1 {main}",
                [],
                EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'plugin only in a stack frame of an install error' => [
                "Installation of shop failed: Call to undefined method Foo::bar()\n#0 /var/www/html/wp-content/plugins/shop/shop.php(3): x()",
                [],
                EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'uncaught type error' => [
                'Uncaught TypeError: x', [], EngineText::INTERNAL_ERROR_DETAIL,
            ],
            'stack trace text' => [
                'Failed at step 3. Stack trace: #0 index.php', [], EngineText::INTERNAL_ERROR_DETAIL,
            ],
        ];
    }

    /**
     * @return array<string, array{0: string, 1: list<string>}>
     */
    public static function untouchedTexts(): array
    {
        return [
            'source plugin text' => ['The source plugin stopped answering.', []],
            'dirty checkout' => ['Checkout is dirty.', []],
            'pending text that is not anchored' => ["Project 'site1' is pending a review.", []],
            'file name without a line number' => ['Could not read wp-config.php: permission denied', []],
            'customer theme error with a file and line' => ['Fatal error in functions.php on line 12', []],
            'source file with a line number, no PHP marker' => ['Problem in /var/www/x.php:12', []],
            'unknown code and no pattern' => ['Something ordinary happened.', ['some_other_code']],
            'PHP warning beside the real cause' => ['Could not create directory. PHP Warning:  Undefined variable $x', []],
            'empty text' => ['', []],
        ];
    }

    #[DataProvider('friendlyTexts')]
    public function test_a_known_refusal_reads_one_friendly_sentence(string $message, array $codes, string $expected): void
    {
        $this->assertSame($expected, EngineText::friendly($message, $codes));
    }

    #[DataProvider('untouchedTexts')]
    public function test_an_ordinary_text_is_left_for_the_caller(string $message, array $codes): void
    {
        $this->assertNull(EngineText::friendly($message, $codes));
    }

    public function test_a_php_warning_does_not_replace_the_real_cause(): void
    {
        $text = 'Could not create directory "uploads". PHP Warning:  Undefined variable $x in wp-content/plugins/x/a.php';

        $this->assertNull(EngineText::friendly($text));
        $this->assertSame($text, EngineText::present($text));
    }

    public function test_a_known_code_decides_before_the_message(): void
    {
        $this->assertSame(
            EngineText::STILL_PREPARING,
            EngineText::friendly('Permission denied (publickey)', ['project_pending']),
        );
    }

    public function test_the_friendly_sentences_are_not_matched_again(): void
    {
        foreach ([
            EngineText::STILL_PREPARING,
            EngineText::SSH_KEY_REFUSED,
            EngineText::SHARED_ZONE_REFUSED,
            EngineText::INTERNAL_ERROR_DETAIL,
            'The plugin "my-plugin" caused an error. Fix or remove it, then try again.',
        ] as $sentence) {
            $this->assertNull(EngineText::friendly($sentence), $sentence);
        }
    }
}
