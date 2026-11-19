<?php

declare(strict_types=1);

namespace PanelAlpha\StaticAnalysis;

use PhpParser\Node;
use PhpParser\Node\Expr;
use PhpParser\Node\Name;
use PhpParser\Node\Scalar\String_;
use PhpParser\Node\Stmt;
use PHPStan\Analyser\Scope;
use PHPStan\Node\VirtualNode;
use PHPStan\PhpDocParser\Ast\ConstExpr\ConstFetchNode;
use PHPStan\PhpDocParser\Ast\Type\ArrayShapeItemNode;
use PHPStan\PhpDocParser\Ast\Type\IdentifierTypeNode;
use PHPStan\PhpDocParser\Ast\Type\ObjectShapeItemNode;
use PHPStan\PhpDocParser\Lexer\Lexer;
use PHPStan\PhpDocParser\Parser\PhpDocParser;
use PHPStan\PhpDocParser\Parser\TokenIterator;
use PHPStan\Rules\IdentifierRuleError;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * `panelalpha/engine-client` knows the Engine API and nothing
 * about the panel. In its files (matched by **path**, `/packages/engine-client/`,
 * so a file cannot escape by lying about its namespace) the rule reports every
 * class name of another `PanelAlpha\…` namespace (the controller, an edition)
 * and of the host's `App\…`; its own `PanelAlpha\EngineClient\…` names are
 * fine.
 *
 * In the Community package's files (`/packages/community/`) it reports every
 * host `App\…` name and every `PanelAlpha\…` name outside the Community package,
 * the controller, the Engine client and the Hub package. In the Hub package's
 * files (`/packages/hub/`) it reports every name outside `PanelAlpha\Hub\…`,
 * as for the Engine client.
 *
 * Both checks read every shape a name can take:
 *
 *  - a class `Name` – an import or grouped import, `extends`/`implements`,
 *    a trait, a `catch` type, a `new`/static call/`instanceof`/class constant,
 *    and any type declaration PHPStan visits directly;
 *  - a string literal (every class-name-shaped run inside it);
 *  - a docblock: written-out names anywhere in its text, and its types parsed
 *    with the PHPDoc parser, so a short name resolves into the file's namespace
 *    or imports as PHPStan resolves it; a name its file declares as a
 *    `@template` or type alias is not a class.
 *
 * PHPStan resolves expression class names itself and does not hand their `Name`
 * to rules, so the expression shapes are read explicitly here. The complementary
 * checks (composer requirements and a text scan) live in `PackageDirectionTest`;
 * `StaticAnalysisConfigTest` pins this rule in `phpstan.neon`.
 *
 * @implements Rule<Node>
 */
final class PackageDirectionRule implements Rule
{
    /** The controller's namespace, which the Community package may name. */
    public const CONTROLLER_NAMESPACE = 'PanelAlpha\\ClientArea';

    /**
     * Path segments that identify the Engine client package.
     *
     * @var list<string>
     */
    public const ENGINE_CLIENT_PATH_SEGMENTS = ['/packages/engine-client/'];

    /** The Engine client's own namespace, the only `PanelAlpha\…` one it may name. */
    public const ENGINE_CLIENT_NAMESPACE = 'PanelAlpha\\EngineClient';

    /** `%s` is the referenced class name. */
    public const ENGINE_CLIENT_MESSAGE = 'Engine client references %s; panelalpha/engine-client names no panel or host class.';

    /**
     * Path segments that identify the PanelAlpha Hub package: like the Engine
     * client, it knows the Hub and nothing about the panel.
     *
     * @var list<string>
     */
    public const HUB_PATH_SEGMENTS = ['/packages/hub/'];

    /** The Hub package's own namespace, the only `PanelAlpha\…` one it may name. */
    public const HUB_NAMESPACE = 'PanelAlpha\\Hub';

    /** `%s` is the referenced class name. */
    public const HUB_MESSAGE = 'Hub package references %s; panelalpha/hub names no panel or host class (each product binds its contracts).';

    /**
     * Path segments that identify the Community feature package. It may name the
     * controller and the Engine client, never the host.
     *
     * @var list<string>
     */
    public const COMMUNITY_PATH_SEGMENTS = ['/packages/community/'];

    /**
     * The `PanelAlpha\…` namespaces the Community package may name.
     *
     * @var non-empty-list<string>
     */
    public const COMMUNITY_ALLOWED_NAMESPACES = [
        'PanelAlpha\\Community',
        self::CONTROLLER_NAMESPACE,
        self::ENGINE_CLIENT_NAMESPACE,
        self::HUB_NAMESPACE,
    ];

    /** `%s` is the referenced class name. */
    public const COMMUNITY_MESSAGE = 'Community package references %s; panelalpha/community names no host (App\\) class and talks to the host through its own contracts.';

    /**
     * A `PanelAlpha\…` or `App\…` class-name-shaped run with at least one
     * segment after the root namespace.
     */
    private const PANEL_NAME_PATTERN = '/(?<![\\w\\\\])\\\\?((?:PanelAlpha|App)(?:\\\\[A-Za-z_][A-Za-z0-9_]*)+)/';

    /** @var array<string, array{uses: array<string, string>, local: array<string, true>}> */
    private array $fileNames = [];

    public function __construct(
        private readonly Lexer $phpDocLexer,
        private readonly PhpDocParser $phpDocParser,
    ) {}

    public function getNodeType(): string
    {
        return Node::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if ($this->isEngineClientFile($scope->getFile())) {
            return $this->panelNameErrors($node, $scope, self::ENGINE_CLIENT_MESSAGE, [self::ENGINE_CLIENT_NAMESPACE]);
        }

        if ($this->isFile($scope->getFile(), self::HUB_PATH_SEGMENTS)) {
            return $this->panelNameErrors($node, $scope, self::HUB_MESSAGE, [self::HUB_NAMESPACE]);
        }

        if ($this->isCommunityFile($scope->getFile())) {
            return $this->panelNameErrors($node, $scope, self::COMMUNITY_MESSAGE, self::COMMUNITY_ALLOWED_NAMESPACES);
        }

        return [];
    }

    /**
     * Every panel or host class name an Engine client or Community
     * package file carries outside its allowed namespaces, in every shape.
     *
     * @param  non-empty-list<string>  $allowed  namespaces without a trailing backslash
     * @return list<IdentifierRuleError>
     */
    private function panelNameErrors(Node $node, Scope $scope, string $message, array $allowed): array
    {
        /** @var list<array{string, int}> $references */
        $references = [];

        if ($node instanceof Name) {
            $references[] = [ltrim($scope->resolveName($node), '\\'), $node->getStartLine()];
        }

        if ($node instanceof String_) {
            foreach ($this->namesIn($node->value, self::PANEL_NAME_PATTERN) as $class) {
                $references[] = [$class, $node->getStartLine()];
            }
        }

        foreach ($this->candidateNames($node) as $name) {
            $references[] = [ltrim($scope->resolveName($name), '\\'), $name->getStartLine()];
        }

        foreach ($this->docBlockClassNames($node, $scope, self::PANEL_NAME_PATTERN) as $class) {
            $references[] = [$class, $node->getStartLine()];
        }

        $errors = [];
        $seen = [];
        foreach ($references as [$class, $line]) {
            if (! $this->isPanelName($class, $allowed) || isset($seen[$class."\0".$line])) {
                continue;
            }
            $seen[$class."\0".$line] = true;
            $errors[] = RuleErrorBuilder::message(sprintf($message, $class))
                ->identifier('panelalpha.packageDirection')
                ->line($line)
                ->build();
        }

        return $errors;
    }

    /**
     * A class of the host (`App\…`) or of a `PanelAlpha\…` namespace outside
     * the allowed ones.
     *
     * @param  non-empty-list<string>  $allowed
     */
    private function isPanelName(string $class, array $allowed): bool
    {
        if (str_starts_with($class, 'App\\')) {
            return true;
        }

        if (! str_starts_with($class, 'PanelAlpha\\')) {
            return false;
        }

        foreach ($allowed as $namespace) {
            if (str_starts_with($class, $namespace.'\\')) {
                return false;
            }
        }

        return true;
    }

    /**
     * Every class-name-shaped run of a pattern in a text.
     *
     * @return list<string>
     */
    private function namesIn(string $text, string $pattern): array
    {
        if (preg_match_all($pattern, $text, $matches) === false) {
            return [];
        }

        return array_values(array_unique($matches[1]));
    }

    /**
     * The class names a real statement's docblock carries: written-out names
     * anywhere in its text, and its parsed types resolved against the file's
     * namespace and imports.
     *
     * @return list<string>
     */
    private function docBlockClassNames(Node $node, Scope $scope, string $pattern): array
    {
        // PHPStan's virtual statements (InFunctionNode, InClassNode, …) copy
        // the underlying node's doc comment, so only a real statement may own
        // one – otherwise a single `@param` would be reported once per wrapper.
        if (! $node instanceof Stmt || $node instanceof VirtualNode) {
            return [];
        }

        $doc = $node->getDocComment();
        if ($doc === null) {
            return [];
        }

        $names = $this->namesIn($doc->getText(), $pattern);
        $context = $this->fileNames($scope->getFile());

        $tokens = new TokenIterator($this->phpDocLexer->tokenize($doc->getText()));
        foreach ($this->typeNames($this->phpDocParser->parse($tokens)) as $type) {
            $resolved = $this->resolveDocName($type, $scope->getNamespace(), $context);
            if ($resolved !== null) {
                $names[] = $resolved;
            }
        }

        return array_values(array_unique($names));
    }

    /**
     * Every class-like identifier inside a parsed PHPDoc (types, and the class
     * of a `Foo::BAR` constant type).
     *
     * @return list<string>
     */
    private function typeNames(mixed $node): array
    {
        if (is_array($node)) {
            $names = [];
            foreach ($node as $child) {
                array_push($names, ...$this->typeNames($child));
            }

            return $names;
        }

        if (! is_object($node)) {
            return [];
        }

        // A shape key (`array{Title: string}`) is a key, not a class.
        if ($node instanceof ArrayShapeItemNode || $node instanceof ObjectShapeItemNode) {
            return $this->typeNames($node->valueType);
        }

        $names = [];
        if ($node instanceof IdentifierTypeNode) {
            $names[] = $node->name;
        } elseif ($node instanceof ConstFetchNode && $node->className !== '') {
            $names[] = $node->className;
        }

        foreach (get_object_vars($node) as $child) {
            array_push($names, ...$this->typeNames($child));
        }

        return $names;
    }

    /**
     * Resolve a PHPDoc identifier the way PHP resolves a class name, or null
     * for a keyword, a pseudo-type, a template or a type alias.
     *
     * @param  array{uses: array<string, string>, local: array<string, true>}  $context
     */
    private function resolveDocName(string $name, ?string $namespace, array $context): ?string
    {
        if (str_starts_with($name, '\\')) {
            return ltrim($name, '\\');
        }

        $parts = explode('\\', $name);
        $first = strtolower($parts[0]);

        if (isset($context['uses'][$first])) {
            $parts[0] = $context['uses'][$first];

            return implode('\\', $parts);
        }

        // Keywords and pseudo-types (`int`, `list`, `self`, `non-empty-string`)
        // are lower-case; every class in these packages is StudlyCase.
        if (count($parts) === 1 && (preg_match('/^[A-Z][A-Za-z0-9_]*$/', $name) !== 1 || isset($context['local'][$name]))) {
            return null;
        }

        return $namespace === null || $namespace === '' ? $name : $namespace.'\\'.$name;
    }

    /**
     * The file's top-level imports (alias => class) and the names it declares
     * as `@template` or type aliases, read once per file.
     *
     * @return array{uses: array<string, string>, local: array<string, true>}
     */
    private function fileNames(string $file): array
    {
        if (isset($this->fileNames[$file])) {
            return $this->fileNames[$file];
        }

        $contents = is_file($file) ? (string) file_get_contents($file) : '';
        $uses = [];
        if (preg_match_all('/^use\s+(?!function\b|const\b)([^;{]+?)\s*;/m', $contents, $matches) > 0) {
            foreach ($matches[1] as $import) {
                foreach (explode(',', $import) as $clause) {
                    $clause = trim($clause);
                    if (preg_match('/^\\\\?([A-Za-z_][A-Za-z0-9_\\\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i', $clause, $use) !== 1) {
                        continue;
                    }
                    $class = $use[1];
                    $alias = $use[2] ?? '';
                    if ($alias === '') {
                        $segments = explode('\\', $class);
                        $alias = (string) end($segments);
                    }
                    $uses[strtolower($alias)] = $class;
                }
            }
        }

        $local = [];
        if (preg_match_all('/@(?:phpstan-|psalm-)?(?:template(?:-covariant|-contravariant)?|type|import-type)\s+([A-Za-z_][A-Za-z0-9_]*)/', $contents, $matches) > 0) {
            foreach ($matches[1] as $name) {
                $local[$name] = true;
            }
        }

        return $this->fileNames[$file] = ['uses' => $uses, 'local' => $local];
    }

    /**
     * The names a non-type node carries: imports, heritage,
     * traits, `catch` types and expression class references, which PHPStan does
     * not pass to rules as `Name` nodes.
     *
     * @return list<Name>
     */
    private function candidateNames(Node $node): array
    {
        if ($node instanceof Stmt\Use_) {
            return array_map(static fn (Stmt\UseUse $use): Name => $use->name, $node->uses);
        }

        if ($node instanceof Stmt\GroupUse) {
            $names = [$node->prefix];
            foreach ($node->uses as $use) {
                $names[] = new Name($node->prefix->toString().'\\'.$use->name->toString());
            }

            return $names;
        }

        if ($node instanceof Stmt\Class_) {
            return array_values(array_filter(array_merge([$node->extends], $node->implements)));
        }

        if ($node instanceof Stmt\Interface_) {
            return $node->extends;
        }

        if ($node instanceof Stmt\TraitUse) {
            return $node->traits;
        }

        if ($node instanceof Stmt\Catch_) {
            return $node->types;
        }

        if (($node instanceof Expr\New_
                || $node instanceof Expr\StaticCall
                || $node instanceof Expr\StaticPropertyFetch
                || $node instanceof Expr\Instanceof_)
            && $node->class instanceof Name
        ) {
            return [$node->class];
        }

        return [];
    }

    private function isEngineClientFile(string $file): bool
    {
        $path = str_replace('\\', '/', $file);
        foreach (self::ENGINE_CLIENT_PATH_SEGMENTS as $segment) {
            if (str_contains($path, $segment)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $segments
     */
    private function isFile(string $file, array $segments): bool
    {
        $path = str_replace('\\', '/', $file);
        foreach ($segments as $segment) {
            if (str_contains($path, $segment)) {
                return true;
            }
        }

        return false;
    }

    private function isCommunityFile(string $file): bool
    {
        $path = str_replace('\\', '/', $file);
        foreach (self::COMMUNITY_PATH_SEGMENTS as $segment) {
            if (str_contains($path, $segment)) {
                return true;
            }
        }

        return false;
    }
}
