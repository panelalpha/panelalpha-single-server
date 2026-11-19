<?php

declare(strict_types=1);

namespace PanelAlpha\StaticAnalysis;

use PhpParser\Node;
use PhpParser\Node\Arg;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\Array_;
use PhpParser\Node\Expr\Cast;
use PhpParser\Node\Expr\ClassConstFetch;
use PhpParser\Node\Expr\FuncCall;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\New_;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Expr\Variable;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PhpParser\Node\Scalar\Int_;
use PhpParser\Node\Scalar\String_;
use PhpParser\ParserFactory;
use PHPStan\Analyser\Scope;
use PHPStan\Node\MethodCallableNode;
use PHPStan\Node\StaticMethodCallableNode;
use PHPStan\Rules\IdentifierRuleError;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;

/**
 * The application-query guard is an AST rule, not a regex scan, so whitespace,
 * line breaks, aliases, container resolution, first-class callables, subclasses and
 * write SQL cannot hide a direct application lookup.
 *
 * The rule runs on every file phpstan.neon analyses (the package `src/` root
 * files included) and reports:
 *  - a static call on the model (anything but `::class`, and the call-site +
 *    id-scoped allow-list below);
 *  - a first-class callable or callable array reaching the model;
 *  - `new Application` and any subclass;
 *  - `app()` / `resolve()` / `App::make` / `Container::get` / `app()->get` and
 *    `->make()` of `Application::class` (or a subclass);
 *  - an instance query builder or relation (`query`, `where`, `newQuery`,
 *    `newModelQuery`, `newQueryWithoutScopes`, `newQueryWithoutRelationships`,
 *    `stagings`, `stagingOf`) on an `Application`-typed receiver, and
 *    `applications()` on a `PanelUser`-typed receiver;
 *  - `DB::table` / `DB::query()->from` / `DB::connection()->table` / joins and
 *    read or write SQL (`from|join|update|insert into|delete from|truncate`)
 *    naming the table, schema-qualified or not.
 *
 * The pinned exclusion list is the mirror owners, matched by **file path**
 * (`src/Sync`, `src/Jobs`, `src/Models`) so a spoofed namespace cannot escape,
 * plus the Community contract implementations that necessarily query it. The
 * allow-lists are **call sites** (`Class::method`, count and reason): the one
 * id-scoped lookup the request path still needs is accepted only inside
 * `LogActivity::record` and only when the AST shows `whereKey(<scalar>)`
 * chained directly on that `query()`; the today's relation lookups are listed
 * with their reason. Each call site's `count` is enforced on the AST: a matching
 * node beyond it is flagged, so a second relation query in an
 * allow-listed method cannot hide behind the first.
 *
 * @implements Rule<Node>
 */
final class ApplicationQueryRule implements Rule
{
    /** The Eloquent model the guard protects. */
    public const MODEL = 'PanelAlpha\\ClientArea\\Models\\Application';

    /** The table name a direct query or raw SQL must not name. */
    public const TABLE = 'applications';

    /**
     * File-path segments that own the mirror and run off the request path
     *Excluding by path, not by declared
     * namespace, means a spoofed namespace cannot escape the rule.
     *
     * @var list<string>
     */
    public const EXCLUDED_PATH_SEGMENTS = [
        '/src/Sync/',
        '/src/Jobs/',
        '/src/Models/',
    ];

    /**
     * The edition contract implementations that own scoped mirror access: the
     * single-user (Community) defaults and the paid edition's
     * (pinned by ApplicationQueryRuleTest).
     *
     * @var list<string>
     */
    public const EXCLUDED_CLASSES = [
        'PanelAlpha\\ClientArea\\Access\\SingleOwnerApplicationRepository',
        'PanelAlpha\\ClientArea\\Provisioning\\SingleEngineProvisioner',
        'PanelAlpha\\ClientArea\\Access\\SingleUserAccessResolver',
        // The paid edition's contract implementations: its repository and its
        // ownership query, the access resolver,
        // the provisioner and the service directory own scoped mirror access.
        'PanelAlpha\\EditionPro\\Access\\OwnedApplications',
        'PanelAlpha\\EditionPro\\Access\\ServiceApplicationRepository',
        'PanelAlpha\\EditionPro\\Access\\ServiceAccessResolver',
        'PanelAlpha\\EditionPro\\Access\\ServiceTableDirectory',
        'PanelAlpha\\EditionPro\\Provisioning\\ServiceProvisioner',
        // The single-server edition (Pro) adopts the mirror's unassigned
        // projects onto its default service:
        // a bulk assignment across every user, with no user to scope to.
        'PanelAlpha\\EditionPro\\Edition\\SingleServerProjects',
        // The Admin Area's Users pages: an admin sees every
        // user's projects, so its one query class reads the mirror unscoped
        // and unassigns the projects of a deleted user's services.
        'PanelAlpha\\AdminAreaController\\Users\\UserProjectQueries',
        // The Admin Area's project counts per plan and per Engine (counts
        // only, never rows).
        'PanelAlpha\\AdminAreaController\\Queries\\HostingCounts',
        // The Admin Area's services and hosting accounts: an admin reads and assigns every
        // project, whoever owns it, so its one mirror query class is not the
        // user-scoped repository.
        'PanelAlpha\\AdminAreaController\\Hosting\\ServiceProjects',
        // The Admin Area's read of the mirror:
        // the admin sees every project on every Engine, assigned or not, so
        // its lists, filters and the import assignment query it directly.
        'PanelAlpha\\AdminAreaController\\Projects\\AdminProjects',
        // The Admin Area's lookup of the service of each project of an Engine
        // (the IP Management tab): an admin read across every user.
        'PanelAlpha\\AdminAreaController\\Engine\\ProjectServices',
        // The pre-created trial accounts: the generator checks the
        // mirror for a subdomain the Engine would refuse as taken.
        'PanelAlpha\\AdminAreaController\\Billing\\TrialAccountFactory',
        // The Reseller Area: a reseller reads the projects of its
        // own services as their owner – its users' shares and the activity on
        // them – which the user-scoped repository mixes with the projects
        // shared with it.
        'PanelAlpha\\AdminAreaController\\Reseller\\ResellerProjects',
        // Multi's placement and server-delete guard: how many
        // projects sit on an Engine, across every user.
        'PanelAlpha\\EditionMulti\\Engines\\EngineProjects',
    ];

    /**
     * The call sites that may keep a direct `Application::query()`, with the
     * number of occurrences and the reason.
     * The lookup is accepted only when the AST shows `whereKey(<scalar id>)`
     * chained directly on that `query()`.
     *
     * @var array<string, array{count: int, reason: string}>
     */
    public const ALLOWED_QUERY_CALL_SITES = [
        'PanelAlpha\\ClientArea\\Http\\Middleware\\LogActivity::record' => [
            'count' => 1,
            'reason' => 'post-delete id existence check, scoped by whereKey',
        ],
    ];

    /**
     * The call sites that may keep a relation query on an `Application` it
     * already got through the repository, with the number of occurrences and
     * the reason.
     *
     * @var array<string, array{count: int, reason: string}>
     */
    public const ALLOWED_RELATION_CALL_SITES = [
        'PanelAlpha\\ClientArea\\Projects\\DeployService::resolveTarget' => [
            'count' => 1,
            'reason' => 'newest staging of a repository-scoped parent',
        ],
        'PanelAlpha\\ClientArea\\Projects\\ProjectService::delete' => [
            'count' => 1,
            'reason' => 'refuse to delete a live project that still has a staging',
        ],
        'PanelAlpha\\ClientArea\\Projects\\StagingService::retry' => [
            'count' => 1,
            'reason' => 'one staging under a repository-scoped parent',
        ],
        'PanelAlpha\\ClientArea\\Projects\\StagingService::pushToStaging' => [
            'count' => 1,
            'reason' => 'latest staging of a repository-scoped live project',
        ],
        'PanelAlpha\\ClientArea\\Projects\\StagingService::pushToStagingDiff' => [
            'count' => 1,
            'reason' => 'latest staging of a repository-scoped live project for the push diff',
        ],
        'PanelAlpha\\ClientArea\\Projects\\StagingService::assertCanCreate' => [
            'count' => 1,
            'reason' => 'refuse a second staging on a repository-scoped parent',
        ],
        'PanelAlpha\\ClientArea\\Projects\\GitService::reuseRepositoryUrl' => [
            'count' => 1,
            'reason' => 'staging repository lookup on a repository-scoped live project',
        ],
    ];

    /** Instance methods that start an unscoped application query. */
    private const INSTANCE_QUERY_METHODS = [
        'query',
        'where',
        'newQuery',
        'newModelQuery',
        'newQueryWithoutScopes',
        'newQueryWithoutRelationships',
    ];

    /** Application relations that reach other application rows. */
    private const RELATION_METHODS = ['stagings', 'stagingOf'];

    /** A user relation that reaches application rows (future editions). */
    private const USER_RELATION_METHODS = ['applications'];

    /** Container methods that resolve the model by class string. */
    private const CONTAINER_METHODS = ['make', 'makeWith', 'get'];

    /** Laravel's container facades a static resolution can hang off. */
    private const CONTAINER_STATIC_CLASSES = [
        'Illuminate\\Support\\Facades\\App',
        'Illuminate\\Container\\Container',
        'Illuminate\\Foundation\\Application',
    ];

    /** Query-builder methods whose arguments name a table or SQL fragment. */
    private const SQL_METHODS = [
        'table',
        'from',
        'fromRaw',
        'join',
        'leftJoin',
        'rightJoin',
        'crossJoin',
        'joinSub',
        'leftJoinSub',
        'rightJoinSub',
        'select',
        'selectOne',
        'statement',
        'update',
        'insert',
        'delete',
        'truncate',
        'unprepared',
        'selectRaw',
        'whereRaw',
        'raw',
    ];

    /** Laravel's database facades/managers a direct table query can hang off. */
    private const DB_CLASSES = [
        'Illuminate\\Support\\Facades\\DB',
        'Illuminate\\Database\\DatabaseManager',
        'Illuminate\\Database\\Connection',
        'Illuminate\\Database\\Query\\Builder',
    ];

    /**
     * Cache of the file positions of `Application::query()` calls that carry a
     * `whereKey(<scalar>)` directly on their chain, keyed by file path.
     *
     * @var array<string, array<int, true>>
     */
    private array $allowedQueryCache = [];

    /**
     * Matching allow-listed nodes already seen, keyed by file and then by
     * `kind:Class::method`, so the pinned `count` is enforced: the (count+1)th
     * node at a call site is flagged.
     *
     * @var array<string, array<string, array<int, true>>>
     */
    private array $allowedNodePositions = [];

    public function getNodeType(): string
    {
        return Node::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if ($this->isExcluded($scope)) {
            return [];
        }

        if ($node instanceof StaticMethodCallableNode) {
            return $this->staticMethodCallable($node, $scope);
        }
        if ($node instanceof MethodCallableNode) {
            return $this->methodCallable($node, $scope);
        }
        if ($node instanceof StaticCall) {
            return $this->staticCall($node, $scope);
        }
        if ($node instanceof New_) {
            return $this->newApplication($node, $scope);
        }
        if ($node instanceof FuncCall) {
            return $this->containerFunction($node, $scope);
        }
        if ($node instanceof MethodCall) {
            return $this->methodCall($node, $scope);
        }
        if ($node instanceof Array_) {
            return $this->callableArray($node, $scope);
        }

        return [];
    }

    /**
     * @return list<IdentifierRuleError>
     */
    private function staticCall(StaticCall $node, Scope $scope): array
    {
        $class = $this->className($node->class, $scope);
        if ($class === null) {
            return [];
        }

        if ($this->isApplicationClass($class)) {
            if ($this->isAllowedIdScoped($node, $scope)) {
                return [];
            }

            return [$this->error($node, 'Direct Application query; go through ApplicationRepository.')];
        }

        if ($node->name instanceof Identifier
            && in_array($node->name->toString(), self::CONTAINER_METHODS, true)
            && in_array(ltrim($class, '\\'), self::CONTAINER_STATIC_CLASSES, true)
            && isset($node->args[0])
            && $this->resolvesApplication($node->args[0], $scope)
        ) {
            return [$this->error($node, 'Container resolution of the Application model; go through ApplicationRepository.')];
        }

        if ($this->isDatabase($class) && $this->namesApplicationTable($node->args, $scope)) {
            return [$this->error($node, 'Direct query on the applications table; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * A first-class callable `Application::query(...)` reaches the model
     * without the normal call shape.
     *
     * @return list<IdentifierRuleError>
     */
    private function staticMethodCallable(StaticMethodCallableNode $node, Scope $scope): array
    {
        if ($this->isApplicationClass($this->className($node->getClass(), $scope))) {
            return [$this->error($node, 'First-class callable reaching the Application model; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * A first-class callable `$app->query(...)` on an Application receiver.
     *
     * @return list<IdentifierRuleError>
     */
    private function methodCallable(MethodCallableNode $node, Scope $scope): array
    {
        if (! $node->getName() instanceof Identifier) {
            return [];
        }
        $method = $node->getName()->toString();

        if (in_array($method, self::INSTANCE_QUERY_METHODS, true) && $this->isApplicationType($scope->getType($node->getVar()))) {
            return [$this->error($node, 'First-class callable building an Application query; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * @return list<IdentifierRuleError>
     */
    private function newApplication(New_ $node, Scope $scope): array
    {
        if ($this->isApplicationClass($this->className($node->class, $scope))) {
            return [$this->error($node, 'Direct Application instantiation; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * @return list<IdentifierRuleError>
     */
    private function containerFunction(FuncCall $node, Scope $scope): array
    {
        if (! $node->name instanceof Name) {
            return [];
        }

        $function = strtolower($node->name->toString());
        if (! in_array($function, ['app', 'resolve'], true) || ! isset($node->args[0])) {
            return [];
        }

        if ($this->resolvesApplication($node->args[0], $scope)) {
            return [$this->error($node, 'Container resolution of the Application model; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * @return list<IdentifierRuleError>
     */
    private function methodCall(MethodCall $node, Scope $scope): array
    {
        if (! $node->name instanceof Identifier) {
            return [];
        }
        $method = $node->name->toString();
        $receiver = $scope->getType($node->var);

        if (in_array($method, self::INSTANCE_QUERY_METHODS, true) && $this->isApplicationType($receiver)) {
            return [$this->error($node, 'Unscoped instance query on an Application; go through ApplicationRepository.')];
        }

        if (in_array($method, self::RELATION_METHODS, true) && $this->isApplicationType($receiver)) {
            $site = $this->callSite($scope);
            $allowed = $site !== null ? (self::ALLOWED_RELATION_CALL_SITES[$site] ?? null) : null;
            if ($allowed !== null && $this->withinAllowedCount($scope, 'relation', $node->getStartFilePos(), $allowed['count'])) {
                return [];
            }

            return [$this->error($node, 'Relation query on an Application; go through ApplicationRepository.')];
        }

        if (in_array($method, self::USER_RELATION_METHODS, true) && $this->isPanelUserType($receiver)) {
            return [$this->error($node, "Relation query on a user's applications; go through ApplicationRepository.")];
        }

        if (in_array($method, self::CONTAINER_METHODS, true) && isset($node->args[0]) && $this->resolvesApplication($node->args[0], $scope)) {
            return [$this->error($node, 'Container resolution of the Application model; go through ApplicationRepository.')];
        }

        if (in_array($method, self::SQL_METHODS, true) && $this->namesApplicationTable($node->args, $scope)) {
            return [$this->error($node, 'Direct query on the applications table; go through ApplicationRepository.')];
        }

        return [];
    }

    /**
     * A PHP callable array `[Application::class, 'method']` reaches the model
     * without ever spelling the query.
     *
     * @return list<IdentifierRuleError>
     */
    private function callableArray(Array_ $node, Scope $scope): array
    {
        if (count($node->items) !== 2) {
            return [];
        }
        [$first, $second] = $node->items;
        if ($first === null || $second === null || $first->key !== null || $second->key !== null) {
            return [];
        }
        if (! $this->isApplicationClass($this->className($first->value, $scope)) || $this->stringConstant($second->value, $scope) === null) {
            return [];
        }

        return [$this->error($node, 'Callable array reaching the Application model; go through ApplicationRepository.')];
    }

    /**
     * The class name an expression names: an imported/aliased `Name`, a
     * `(X::class)::query()` class-string, or a variable whose type is a
     * class-string of the model.
     */
    private function className(Node $class, Scope $scope): ?string
    {
        if ($class instanceof Name) {
            return ltrim($scope->resolveName($class), '\\');
        }

        if ($class instanceof ClassConstFetch && $class->name instanceof Identifier && $class->name->toString() === 'class') {
            return $this->className($class->class, $scope);
        }

        if (! $class instanceof Expr) {
            return null;
        }

        $type = $scope->getType($class);
        if ($type->isClassString()->yes()) {
            $type = $type->getClassStringObjectType();
        }

        foreach ($type->getObjectClassNames() as $name) {
            return ltrim($name, '\\');
        }

        return null;
    }

    /**
     * Whether an argument is `Application::class`, its class-string literal or
     * a subclass class-string.
     */
    private function resolvesApplication(Arg $argument, Scope $scope): bool
    {
        if ($this->isApplicationClass($this->className($argument->value, $scope))) {
            return true;
        }

        return in_array($this->stringConstant($argument->value, $scope), [self::MODEL, '\\'.self::MODEL], true);
    }

    /**
     * Whether any argument names the applications table or a raw SQL fragment
     * that does, in a read or write context.
     *
     * @param  array<array-key, Arg>  $args
     */
    private function namesApplicationTable(array $args, Scope $scope): bool
    {
        foreach ($args as $argument) {
            $value = $this->stringConstant($argument->value, $scope);
            if ($value !== null && $this->isApplicationsTable($value)) {
                return true;
            }
        }

        return false;
    }

    private function isApplicationsTable(string $value): bool
    {
        // A bare table name, schema-qualified and/or aliased.
        $table = preg_quote(self::TABLE, '~');
        if (preg_match('~^\s*[`"\']?(?:\w+\.)?'.$table.'[`"\']?(\s+as\s+\w+)?\s*$~i', $value) === 1) {
            return true;
        }

        // A read or write statement naming the table.
        return preg_match(
            '~(?<![\w`])(?:from|join|update|insert\s+into|delete\s+from|truncate)\s+[`"\']?(?:\w+\.)?'.$table.'[`"\']?(?![\w])~i',
            $value,
        ) === 1;
    }

    /**
     * The id-scoped allow-list: the call site must be pinned and
     * the AST must show `whereKey(<scalar id>)` directly on this `query()`'s
     * chain. A text search alone cannot prove either.
     */
    private function isAllowedIdScoped(StaticCall $node, Scope $scope): bool
    {
        if (! $node->name instanceof Identifier || $node->name->toString() !== 'query') {
            return false;
        }
        $site = $this->callSite($scope);
        $allowed = $site !== null ? (self::ALLOWED_QUERY_CALL_SITES[$site] ?? null) : null;
        if ($allowed === null) {
            return false;
        }

        $position = $node->getStartFilePos();
        if ($position < 0 || ! isset($this->allowedQueryPositions($scope->getFile())[$position])) {
            return false;
        }

        return $this->withinAllowedCount($scope, 'query', $position, $allowed['count']);
    }

    /**
     * Whether this matching node is still inside the pinned `count` for its
     * allow-listed call site. The (count+1)th node at the same site is rejected,
     * so a second `$parent->stagings()` in `StagingService::retry` cannot hide
     * behind the first.
     */
    private function withinAllowedCount(Scope $scope, string $kind, int $position, int $limit): bool
    {
        $site = $this->callSite($scope);
        if ($site === null || $position < 0) {
            return false;
        }

        $key = $kind.':'.$site;
        $file = $scope->getFile();
        $seen = $this->allowedNodePositions[$file][$key] ?? [];
        $seen[$position] = true;
        $this->allowedNodePositions[$file][$key] = $seen;

        return count($seen) <= $limit;
    }

    private function callSite(Scope $scope): ?string
    {
        $class = $scope->getClassReflection()?->getName();
        $function = $scope->getFunctionName();
        if ($class === null || $function === null) {
            return null;
        }

        return $class.'::'.$function;
    }

    /**
     * The file positions of `Application::query()` calls whose chain carries a
     * `whereKey(<scalar>)`, parsed from the real AST and cached per file.
     *
     * @return array<int, true>
     */
    private function allowedQueryPositions(string $file): array
    {
        if (isset($this->allowedQueryCache[$file])) {
            return $this->allowedQueryCache[$file];
        }

        $positions = [];
        $code = @file_get_contents($file);
        if (is_string($code)) {
            try {
                $ast = (new ParserFactory())->createForNewestSupportedVersion()->parse($code) ?? [];
                $this->collectAllowedQueries($ast, $positions);
            } catch (\Throwable) {
                // A file that cannot be re-parsed proves nothing: leave the set
                // empty so an unproven query stays flagged.
            }
        }

        return $this->allowedQueryCache[$file] = $positions;
    }

    /**
     * @param  array<array-key, Node>  $nodes
     * @param  array<int, true>  $positions
     */
    private function collectAllowedQueries(array $nodes, array &$positions): void
    {
        foreach ($nodes as $node) {
            if (! $node instanceof Node) {
                continue;
            }

            if ($node instanceof MethodCall
                && $node->name instanceof Identifier
                && $node->name->toString() === 'whereKey'
                && isset($node->args[0])
                && $this->isScalarIdExpression($node->args[0]->value)
            ) {
                $base = $this->queryBase($node->var);
                if ($base !== null) {
                    $position = $base->getStartFilePos();
                    if ($position >= 0) {
                        $positions[$position] = true;
                    }
                }
            }

            foreach ($node->getSubNodeNames() as $name) {
                $child = $node->$name;
                if ($child instanceof Node) {
                    $this->collectAllowedQueries([$child], $positions);
                } elseif (is_array($child)) {
                    $nested = [];
                    foreach ($child as $candidate) {
                        if ($candidate instanceof Node) {
                            $nested[] = $candidate;
                        }
                    }
                    $this->collectAllowedQueries($nested, $positions);
                }
            }
        }
    }

    /**
     * The bottom `Application::query()` of a method chain, when the chain is
     * rooted at one.
     */
    private function queryBase(Expr $expr): ?StaticCall
    {
        while ($expr instanceof MethodCall) {
            $expr = $expr->var;
        }

        if ($expr instanceof StaticCall
            && $expr->name instanceof Identifier
            && $expr->name->toString() === 'query'
            && $expr->class instanceof Name
        ) {
            $name = ltrim($expr->class->toString(), '\\');
            if ($name === 'Application' || $name === self::MODEL) {
                return $expr;
            }
        }

        return null;
    }

    private function isScalarIdExpression(Expr $expr): bool
    {
        return $expr instanceof Int_
            || $expr instanceof String_
            || $expr instanceof Variable
            || $expr instanceof Cast;
    }

    private function stringConstant(Expr $expr, Scope $scope): ?string
    {
        if ($expr instanceof String_) {
            return $expr->value;
        }

        foreach ($scope->getType($expr)->getConstantStrings() as $constant) {
            return $constant->getValue();
        }

        return null;
    }

    private function isApplicationClass(?string $class): bool
    {
        if ($class === null) {
            return false;
        }
        $class = ltrim($class, '\\');
        if ($class === self::MODEL) {
            return true;
        }
        if ($class === '') {
            return false;
        }

        try {
            return (new ObjectType(self::MODEL))->isSuperTypeOf(new ObjectType($class))->yes();
        } catch (\Throwable) {
            return false;
        }
    }

    private function isApplicationType(Type $type): bool
    {
        return (new ObjectType(self::MODEL))->isSuperTypeOf($type)->yes();
    }

    private function isPanelUserType(Type $type): bool
    {
        return (new ObjectType('PanelAlpha\\ClientArea\\Contracts\\PanelUser'))->isSuperTypeOf($type)->yes();
    }

    private function isDatabase(string $class): bool
    {
        return in_array(ltrim($class, '\\'), self::DB_CLASSES, true);
    }

    /**
     * The mirror owners are matched by **file path** so a namespace cannot be
     * spoofed to escape the rule.
     */
    private function isExcluded(Scope $scope): bool
    {
        $class = $scope->getClassReflection();
        if ($class === null) {
            return false;
        }

        if (in_array($class->getName(), self::EXCLUDED_CLASSES, true)) {
            return true;
        }

        $file = str_replace('\\', '/', $scope->getFile());
        foreach (self::EXCLUDED_PATH_SEGMENTS as $segment) {
            if (str_contains($file, $segment)) {
                return true;
            }
        }

        return false;
    }

    private function error(Node $node, string $message): IdentifierRuleError
    {
        return RuleErrorBuilder::message($message)
            ->identifier('panelalpha.applicationQuery')
            ->line($node->getStartLine())
            ->build();
    }
}
