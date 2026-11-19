<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Container\Container as ConcreteContainer;
use Illuminate\Contracts\Container\Container;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\SingleEngineResolver;
use PanelAlpha\ClientArea\Provisioning\SingleEngineProvisioner;

/**
 * Single-user mode is all or nothing. The controller's
 * defaults answer the four edition questions for exactly one user on one
 * Engine; a multi-user edition must never run with one of those answers left
 * in place (a Pro `AccessResolver` next to the default
 * `SingleOwnerApplicationRepository` would show every user every project).
 *
 * Either all four contracts resolve to the controller's defaults (Community), or
 * none of the three single-user ones does (Pro, Multi); `EngineResolver` may
 * keep `SingleEngineResolver` in a multi-user edition with one Engine (Pro).
 * Anything else is a {@see SingleUserModeException}, thrown while the
 * controller boots, so a mixed install never serves a request.
 */
final class SingleUserMode
{
    /**
     * The single-user answers: contract => the controller's default.
     *
     * @var array<string, string>
     */
    public const SINGLE_USER_DEFAULTS = [
        ApplicationRepository::class => SingleOwnerApplicationRepository::class,
        AccessResolver::class => SingleUserAccessResolver::class,
        ApplicationProvisioner::class => SingleEngineProvisioner::class,
    ];

    /**
     * The one-Engine default, shared with Pro.
     *
     * @var array<string, string>
     */
    public const ENGINE_DEFAULT = [
        EngineResolver::class => SingleEngineResolver::class,
    ];

    /**
     * True when all four contracts resolve to the controller's defaults, false
     * when none of the three single-user ones does.
     *
     * @throws SingleUserModeException when a single-user default stays next to a replaced contract
     */
    public static function active(Container $container): bool
    {
        $onDefault = [];
        $replaced = [];
        foreach ([...self::ENGINE_DEFAULT, ...self::SINGLE_USER_DEFAULTS] as $contract => $default) {
            if (self::resolvesTo($container, $contract, $default)) {
                $onDefault[] = $contract;
            } else {
                $replaced[] = $contract;
            }
        }

        if ($replaced === []) {
            return true;
        }

        $singleUserOnDefault = array_values(array_intersect($onDefault, array_keys(self::SINGLE_USER_DEFAULTS)));
        if ($singleUserOnDefault === []) {
            return false;
        }

        throw SingleUserModeException::mixed($replaced, $singleUserOnDefault);
    }

    private static function resolvesTo(Container $container, string $contract, string $default): bool
    {
        $wasResolved = $container->resolved($contract);
        $onDefault = $container->make($contract) instanceof $default;

        // Looking must not build the answer early: drop the shared instance this
        // check created, so the first real use resolves it after every provider
        // has booted, as before the check existed.
        if (! $wasResolved && $container instanceof ConcreteContainer) {
            $container->forgetInstance($contract);
        }

        return $onDefault;
    }
}
