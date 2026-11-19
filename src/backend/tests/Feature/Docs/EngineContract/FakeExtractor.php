<?php

namespace Tests\Feature\Docs\EngineContract;

use PhpParser\Node;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\ArrayItem;
use PhpParser\Node\Scalar;
use PhpParser\NodeFinder;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitor\NameResolver;
use PhpParser\ParserFactory;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Pro\MultiEngineFixtures;
use Tests\Support\TestNetwork;
use Throwable;

/**
 * Reads the Engine answers a test source fakes: every `Http::fake([...])`
 * entry whose key is an Engine URL, and every `fakeEngines([...])` route. The
 * source is parsed, not run: a body is worked out where it is written with
 * literals, class constants, `TestNetwork` and the {@see FixtureHarness}
 * builders, and anything else (a variable, an unknown call) becomes
 * {@see Unknown}, which matches every schema.
 */
final class FakeExtractor
{
    private const HTTP = 'Illuminate\\Support\\Facades\\Http';

    private const ENGINE_URL = '#^(https?://)?engine\d*\.example\.com/api(/|\*|$)#';

    private const FUNCTIONS = ['array_merge', 'array_replace', 'ucfirst', 'strtoupper', 'strtolower', 'min', 'max', 'str_repeat'];

    /** @var array<string, Expr> */
    private array $constants = [];

    private bool $urlMode = false;

    private FixtureHarness $harness;

    public function __construct()
    {
        $this->harness = new FixtureHarness();
    }

    /**
     * @return array{fakes: list<array{file: string, line: int, method: ?string, path: string, status: int, body: mixed, json: bool}>, skipped: array<string, int>}
     */
    public function extract(string $file, string $label): array
    {
        $source = (string) file_get_contents($file);
        if (! str_contains($source, 'Http::') && ! str_contains($source, 'fakeEngines(')) {
            return ['fakes' => [], 'skipped' => []];
        }

        $parser = (new ParserFactory())->createForNewestSupportedVersion();
        $statements = $parser->parse($source) ?? [];
        $traverser = new NodeTraverser(new NameResolver());
        $statements = $traverser->traverse($statements);

        $finder = new NodeFinder();
        $this->constants = [];
        foreach ($finder->findInstanceOf($statements, Node\Const_::class) as $const) {
            $this->constants[$const->name->toString()] = $const->value;
        }

        $fakes = [];
        $skipped = [];
        $skip = static function (string $reason) use (&$skipped): void {
            $skipped[$reason] = ($skipped[$reason] ?? 0) + 1;
        };

        foreach ($finder->findInstanceOf($statements, Expr\StaticCall::class) as $call) {
            if (! $this->isHttpCall($call, 'fake')) {
                continue;
            }
            $argument = $call->args[0]->value ?? null;
            if (! $argument instanceof Expr\Array_) {
                $skip('fake argument is not an array literal');

                continue;
            }
            foreach ($argument->items as $item) {
                if (! $item instanceof ArrayItem || $item->key === null) {
                    $skip('fake entry without a key');

                    continue;
                }
                $key = $this->evaluateUrl($item->key);
                if (! is_string($key) || preg_match(self::ENGINE_URL, $key) !== 1) {
                    continue;
                }
                $path = $this->pathOf($key);
                if ($path === null) {
                    $skip('Engine key without a path (`*`)');

                    continue;
                }
                $responses = $this->responses($item->value);
                if ($responses === null) {
                    $skip('value is a closure, a variable or an unknown call');

                    continue;
                }
                foreach ($responses as [$body, $status, $json]) {
                    $fakes[] = ['file' => $label, 'line' => $item->getStartLine(), 'method' => null, 'path' => $path, 'status' => $status, 'body' => $body, 'json' => $json];
                }
            }
        }

        foreach ($finder->findInstanceOf($statements, Expr\MethodCall::class) as $call) {
            if (! $call->name instanceof Node\Identifier || $call->name->toString() !== 'fakeEngines') {
                continue;
            }
            $argument = $call->args[0]->value ?? null;
            if (! $argument instanceof Expr\Array_) {
                $skip('fakeEngines argument is not an array literal');

                continue;
            }
            foreach ($argument->items as $item) {
                $key = $item instanceof ArrayItem && $item->key !== null ? $this->evaluate($item->key) : null;
                if (! is_string($key) || preg_match('#^[12] (GET|POST|PUT|PATCH|DELETE) (\S+)$#', $key, $match) !== 1) {
                    $skip('fakeEngines route key is not a literal');

                    continue;
                }
                if (! $item->value instanceof Expr\Array_) {
                    $skip('fakeEngines route value is not an array literal');

                    continue;
                }
                $body = $this->evaluate($item->value->items[0]->value ?? new Expr\ConstFetch(new Node\Name('null')));
                $status = isset($item->value->items[1]) ? $this->evaluate($item->value->items[1]->value) : 200;
                if (! is_int($status)) {
                    $skip('status is not a literal');

                    continue;
                }
                $fakes[] = ['file' => $label, 'line' => $item->getStartLine(), 'method' => $match[1], 'path' => '/'.$match[2], 'status' => $status, 'body' => $body, 'json' => is_array($body)];
            }
        }

        return ['fakes' => $fakes, 'skipped' => $skipped];
    }

    /**
     * The `/path` below `/api` of a fake key; a trailing `*` (the rest of the
     * URL is open) is kept as a trailing `*` on the path, the query is left out,
     * a `*` inside stands for one segment.
     */
    private function pathOf(string $key): ?string
    {
        $path = (string) preg_replace('#^(https?://)?[^/]+/api#', '', $key);
        $path = (string) preg_replace('#\?.*$#', '', $path);
        $open = str_ends_with($path, '*');
        $path = str_replace('*', 'x', rtrim(rtrim($path, '*'), '/'));
        if ($open && $path !== '') {
            $path .= '*';
        }

        return $path === '' ? null : $path;
    }

    /**
     * @return list<array{0: mixed, 1: int, 2: bool}>|null  body, status, whether the body is JSON
     */
    private function responses(Expr $value): ?array
    {
        if ($value instanceof Expr\Array_) {
            return [[$this->evaluate($value), 200, true]];
        }
        if ($value instanceof Expr\StaticCall && $this->isHttpCall($value, 'response')) {
            $response = $this->response($value);

            return $response === null ? null : [$response];
        }
        // Http::sequence()->push(...)->pushStatus(...)
        $calls = [];
        $cursor = $value;
        while ($cursor instanceof Expr\MethodCall) {
            array_unshift($calls, $cursor);
            $cursor = $cursor->var;
        }
        if ($cursor instanceof Expr\StaticCall && $this->isHttpCall($cursor, 'sequence') && $calls !== []) {
            $answers = [];
            foreach ($calls as $call) {
                $name = $call->name instanceof Node\Identifier ? $call->name->toString() : '';
                if ($name === 'push') {
                    $body = isset($call->args[0]) ? $this->evaluate($call->args[0]->value) : [];
                    $status = isset($call->args[1]) ? $this->evaluate($call->args[1]->value) : 200;
                    if (is_int($status)) {
                        $answers[] = [$body, $status, true];
                    }
                } elseif ($name === 'pushStatus') {
                    $status = $this->evaluate($call->args[0]->value ?? new Scalar\Int_(200));
                    if (is_int($status)) {
                        $answers[] = [[], $status, false];
                    }
                }
            }

            return $answers === [] ? null : $answers;
        }

        return null;
    }

    /**
     * @return array{0: mixed, 1: int, 2: bool}|null
     */
    private function response(Expr\StaticCall $call): ?array
    {
        $body = isset($call->args[0]) ? $this->evaluate($call->args[0]->value) : null;
        $status = isset($call->args[1]) ? $this->evaluate($call->args[1]->value) : 200;
        if (! is_int($status)) {
            return null;
        }
        // A string or an empty body is plain text; only its status is checked.

        return [$body, $status, is_array($body)];
    }

    private function isHttpCall(Expr\StaticCall $call, string $method): bool
    {
        return $call->class instanceof Node\Name
            && $call->class->toString() === self::HTTP
            && $call->name instanceof Node\Identifier
            && $call->name->toString() === $method;
    }

    private function evaluateUrl(Expr $node): mixed
    {
        $this->urlMode = true;
        try {
            return $this->evaluate($node);
        } finally {
            $this->urlMode = false;
        }
    }

    private function evaluate(Expr $node): mixed
    {
        try {
            return $this->walk($node);
        } catch (Throwable) {
            return new Unknown();
        }
    }

    private function walk(Expr $node): mixed
    {
        if ($node instanceof Scalar\String_ || $node instanceof Scalar\Int_ || $node instanceof Scalar\Float_) {
            return $node->value;
        }
        if ($node instanceof Expr\ConstFetch) {
            return match (strtolower($node->name->toString())) {
                'true' => true,
                'false' => false,
                'null' => null,
                default => new Unknown(),
            };
        }
        if ($node instanceof Scalar\InterpolatedString) {
            $text = '';
            foreach ($node->parts as $part) {
                if ($part instanceof Node\InterpolatedStringPart) {
                    $text .= $part->value;
                } else {
                    $value = $this->walk($part);
                    $text .= is_scalar($value) ? (string) $value : 'x';
                }
            }

            return $text;
        }
        if ($node instanceof Expr\BinaryOp\Concat) {
            $left = $this->walk($node->left);
            $right = $this->walk($node->right);

            return (is_scalar($left) ? (string) $left : 'x').(is_scalar($right) ? (string) $right : 'x');
        }
        if ($node instanceof Expr\UnaryMinus) {
            $value = $this->walk($node->expr);

            return is_int($value) || is_float($value) ? -$value : new Unknown();
        }
        if ($node instanceof Expr\Array_) {
            $array = [];
            foreach ($node->items as $item) {
                if ($item->unpack) {
                    return new Unknown();
                }
                $value = $this->walk($item->value);
                if ($item->key === null) {
                    $array[] = $value;
                } else {
                    $key = $this->walk($item->key);
                    if (! is_int($key) && ! is_string($key)) {
                        return new Unknown();
                    }
                    $array[$key] = $value;
                }
            }

            return $array;
        }
        if ($node instanceof Expr\Variable) {
            return $this->urlMode ? 'x' : new Unknown();
        }
        if ($node instanceof Expr\ClassConstFetch && $node->name instanceof Node\Identifier) {
            return $this->classConstant($node);
        }
        if ($node instanceof Expr\StaticCall && $node->class instanceof Node\Name && $node->class->toString() === TestNetwork::class && $node->name instanceof Node\Identifier) {
            return TestNetwork::{$node->name->toString()}(...$this->arguments($node->args, null));
        }
        if ($node instanceof Expr\MethodCall
            && $node->var instanceof Expr\Variable && $node->var->name === 'this'
            && $node->name instanceof Node\Identifier
            && in_array($node->name->toString(), FixtureHarness::BUILDERS, true)
        ) {
            $name = $node->name->toString();

            return $this->harness->{$name}(...$this->arguments($node->args, new ReflectionMethod(FixtureHarness::class, $name)));
        }
        if ($node instanceof Expr\FuncCall && $node->name instanceof Node\Name && in_array($node->name->toString(), self::FUNCTIONS, true)) {
            $arguments = $this->arguments($node->args, null);
            foreach ($arguments as $argument) {
                if ($this->containsUnknown($argument)) {
                    return in_array($node->name->toString(), ['array_merge', 'array_replace'], true) ? $this->mergeWithUnknown($node->name->toString(), $arguments) : new Unknown();
                }
            }

            return ($node->name->toString())(...$arguments);
        }

        return new Unknown();
    }

    /**
     * @param  list<mixed>  $arguments
     */
    private function mergeWithUnknown(string $function, array $arguments): mixed
    {
        $arrays = array_values(array_filter($arguments, 'is_array'));

        return count($arrays) === count($arguments) ? $function(...$arrays) : new Unknown();
    }

    private function containsUnknown(mixed $value): bool
    {
        if ($value instanceof Unknown) {
            return true;
        }

        return is_array($value) && array_filter($value, fn (mixed $item): bool => $this->containsUnknown($item)) !== [];
    }

    private function classConstant(Expr\ClassConstFetch $node): mixed
    {
        $name = $node->name->toString();
        if ($name === 'class' || ! $node->class instanceof Node\Name) {
            return new Unknown();
        }
        $class = $node->class->toString();
        if (in_array(strtolower($class), ['self', 'static'], true)) {
            if (isset($this->constants[$name])) {
                return $this->walk($this->constants[$name]);
            }
            foreach ([EngineFixtures::class, MultiEngineFixtures::class] as $trait) {
                if (defined($trait.'::'.$name)) {
                    return constant($trait.'::'.$name);
                }
            }

            return new Unknown();
        }

        return defined($class.'::'.$name) ? constant($class.'::'.$name) : new Unknown();
    }

    /**
     * Evaluated call arguments. With a reflected builder an unknown argument
     * becomes a default of the parameter's type, so the builder still runs.
     *
     * @param  array<Node\Arg|Node\VariadicPlaceholder>  $args
     * @return list<mixed>
     */
    private function arguments(array $args, ?ReflectionMethod $method): array
    {
        $values = [];
        foreach ($args as $index => $argument) {
            if (! $argument instanceof Node\Arg || $argument->unpack || $argument->name !== null) {
                throw new \RuntimeException('Unsupported argument.');
            }
            $value = $this->walk($argument->value);
            if ($method !== null && $this->containsUnknown($value) && ! is_array($value)) {
                $type = $method->getParameters()[$index]->getType();
                $value = match ($type instanceof ReflectionNamedType ? $type->getName() : '') {
                    'array' => [],
                    'int' => 1,
                    'string' => 'x',
                    default => throw new \RuntimeException('Unknown argument.'),
                };
            }
            $values[] = $value;
        }

        return $values;
    }
}
