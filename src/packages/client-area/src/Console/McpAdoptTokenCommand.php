<?php

namespace PanelAlpha\ClientArea\Console;

use Illuminate\Console\Command;
use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\Model;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Mcp\McpTokenAdoptionRefused;
use PanelAlpha\ClientArea\Mcp\McpTokenService;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * Adopt an Engine MCP token minted before the panel recorded owners as a user's Connect AI
 * token: rescope it to that user's projects and record the ownership
 * (`McpTokenService::adopt()`). Until then such a token is refused by the
 * panel's `/mcp` gatekeeper. There is no automatic adoption: an unowned token
 * may be the Engine operator's own server-wide token.
 *
 * `--user` (id or email) defaults to the only user in single-user mode and is
 * required otherwise. `--engine` names the Engine that holds the token (Multi);
 * it defaults to the default Engine.
 */
final class McpAdoptTokenCommand extends Command
{
    protected $signature = 'client-area:mcp-adopt-token
                            {engineTokenId : The Engine MCP token id (the number before the "|" of the token)}
                            {--user= : The owner, by id or email (defaults to the only user in single-user mode)}
                            {--engine= : The Engine that holds the token (defaults to the default Engine)}';

    protected $description = 'Adopt an Engine MCP token as a user\'s Connect AI token, scoped to that user\'s projects';

    public function handle(McpTokenService $tokens, Container $container, EngineResolver $engines): int
    {
        $tokenId = Payload::string($this->argument('engineTokenId'));
        if (! ctype_digit($tokenId) || (int) $tokenId < 1) {
            $this->error('The Engine MCP token id must be a positive number.');

            return self::FAILURE;
        }

        $user = $this->owner($container);
        if ($user === null) {
            return self::FAILURE;
        }

        $engineId = null;
        $engineOption = Payload::string($this->option('engine'));
        if ($engineOption !== '') {
            $engineId = ctype_digit($engineOption) ? (int) $engineOption : null;
            if ($engineId === null || ! in_array($engineId, $engines->engineIds(), true)) {
                $this->error("No Engine matches --engine={$engineOption}.");

                return self::FAILURE;
            }
        }

        try {
            $token = $tokens->adopt($user, (int) $tokenId, $engineId);
        } catch (McpTokenAdoptionRefused $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } catch (EngineException|EngineValidationException $e) {
            $this->error('The Engine refused the token\'s new scope: '.EngineErrors::message($e));

            return self::FAILURE;
        }

        $projects = Payload::strings(is_array($token['projects'] ?? null) ? $token['projects'] : []);
        $this->info(sprintf(
            'Engine MCP token %s is now a Connect AI token of user #%s, scoped to %s.',
            $tokenId,
            Payload::string($user->getAuthIdentifier()),
            $projects === [] ? 'no project' : implode(', ', $projects),
        ));

        return self::SUCCESS;
    }

    private function owner(Container $container): ?PanelUser
    {
        /** @var class-string<Model> $model */
        $model = config('auth.providers.users.model');
        $option = Payload::string($this->option('user'));

        if ($option === '') {
            if (! SingleUserMode::active($container)) {
                $this->error('--user is required outside single-user mode.');

                return null;
            }

            $users = $model::query()->limit(2)->get();
            if ($users->count() !== 1) {
                $this->error('--user is required: single-user mode has '.($users->isEmpty() ? 'no user' : 'more than one user row').'.');

                return null;
            }
            $user = $users->first();
        } else {
            $user = ctype_digit($option)
                ? $model::query()->whereKey((int) $option)->first()
                : $model::query()->where('email', $option)->first();
        }

        if (! $user instanceof PanelUser) {
            $this->error("No user matches --user={$option}.");

            return null;
        }

        return $user;
    }
}
