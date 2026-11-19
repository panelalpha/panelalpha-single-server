<?php

namespace PanelAlpha\ClientArea\Access;

/**
 * An edition replaced some of the four contracts but left a single-user
 * default in place ({@see SingleUserMode}). Thrown while the controller boots.
 */
final class SingleUserModeException extends \LogicException
{
    /**
     * @param  list<string>  $replaced  contract names
     * @param  list<string>  $stillDefault  contract names
     */
    public static function mixed(array $replaced, array $stillDefault): self
    {
        return new self(sprintf(
            'Single-user mode is all or nothing: %s %s replaced, but %s still %s to the controller\'s single-user '
            .'defaults. A multi-user edition binds ApplicationRepository, AccessResolver and ApplicationProvisioner '
            .'with singleton().',
            implode(', ', $replaced),
            count($replaced) === 1 ? 'is' : 'are',
            implode(', ', $stillDefault),
            count($stillDefault) === 1 ? 'resolves' : 'resolve',
        ));
    }
}
