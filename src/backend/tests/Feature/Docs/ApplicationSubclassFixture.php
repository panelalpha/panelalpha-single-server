<?php

namespace Tests\Feature\Docs;

use PanelAlpha\ClientArea\Models\Application;

/**
 * A real Application subclass so the application-query rule test
 * can prove subclass detection with a class the PHPStan ReflectionProvider can
 * autoload; a class declared inside a temp fixture is not resolvable there.
 */
final class ApplicationSubclassFixture extends Application
{
}
