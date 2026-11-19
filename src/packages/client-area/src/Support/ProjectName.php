<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * Engine project-name rules (`core/app/Rules/ProjectName.php`): a username is
 * 3-15 characters, lowercase letters and digits, starting with a letter. The
 * panel builds a suggestion from a user-supplied label (e.g. an uploaded
 * archive's file name) before sending it as the Engine `name`.
 */
final class ProjectName
{
    public const PATTERN = '^[a-z][a-z0-9]{2,14}$';

    /**
     * The nearest valid project name, or null when too little of the value
     * survives. Same algorithm as the Engine's `ProjectName::suggest()`.
     */
    public static function suggest(string $value): ?string
    {
        $name = (string) preg_replace('/[^a-z0-9]/', '', strtolower($value));
        $name = substr(ltrim($name, '0123456789'), 0, 15);

        return strlen($name) >= 3 ? $name : null;
    }
}
