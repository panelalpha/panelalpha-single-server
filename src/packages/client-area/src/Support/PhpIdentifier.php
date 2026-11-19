<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * The name of a `wp-config.php` constant or variable, without a leading `$`.
 * The Engine's `wp/config/{name}` route carries only these characters and
 * answers a routing 405 for any other name, so the panel refuses it first.
 */
final class PhpIdentifier
{
    /** A PHP constant or variable name, as the Engine's route carries it. */
    public const string PATTERN = '/^[A-Za-z_][A-Za-z0-9_]*\z/';

    /** The name field's refusal, the same words for the form rule and a routing 405. */
    public const string REFUSAL = 'The name must be a valid PHP constant or variable name: letters, digits and underscores, and it cannot start with a digit.';
}
