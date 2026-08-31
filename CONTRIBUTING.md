# Contributing to Agent Sudo

Thanks for your interest. Agent Sudo is deliberately small, and keeping it small
is a feature — please read the [scope](#scope) section before proposing changes.

## Requirements

- **Node ≥ 22** (the CI matrix is 22.x and 24.x).
- No other tooling. There are **zero runtime dependencies** and only two
  devDependencies (`typescript`, `@types/node`).

## Getting set up

```bash
git clone https://github.com/MLupu88/ai-agent-sudo.git
cd ai-agent-sudo
npm install
```

## The checks

Every change must keep all of these green:

```bash
npm test                       # node --test — library + CLI tests
npm run typecheck              # tsc --noEmit, strict
npm run build                  # emits dist/ (declarations included)
npm run example                # integration example — all three outcomes
npm run example:cross-runtime  # cross-runtime equivalence proof
```

Or run the whole gate at once:

```bash
npm run release:check
```

Tests use Node's built-in test runner and its native TypeScript execution — there
is no test framework to learn. Put engine/matcher/validation tests in `test/`,
matching the existing style (`node:assert/strict`, `node:test`).

## Pull requests

- **Branch** from `main`; name it descriptively (e.g.
  `fix/context-array-matching`).
- Keep PRs focused — one concern per PR.
- Update the relevant `docs/*.md` and `README.md` when behaviour or the public
  surface changes.
- Add or adjust tests for any behaviour change.
- Add a `CHANGELOG.md` entry under an "Unreleased" heading.
- CI (`.github/workflows/ci.yml`) must pass.

## Scope

Agent Sudo answers exactly one question — *may this actor perform this action, on
this resource, in this context?* — and returns one of `allow` / `deny` /
`require_approval`. It is a library and a contract, not a platform.

**Welcome:** bug fixes, clearer errors, documentation, more tests, tighter types,
performance work that does not change behaviour, CI and packaging improvements.

**Deliberately out of scope** (PRs adding these will be declined):

- new matching capabilities — regex/glob, comparison operators, negation, nested
  boolean expressions, policy inheritance;
- a policy DSL or a YAML/TOML policy format;
- provider-specific knowledge in `src/` — OpenAI/MCP/Anthropic/LangChain
  awareness, provider SDKs, a universal action vocabulary, provider
  normalization;
- anything that performs I/O from the core: network calls, LLM calls, a server, a
  database, telemetry, a remote policy registry;
- approval orchestration, queues, dashboards, or a UI.

These are not "not yet" — they are architectural boundaries. A change that
expands policy semantics or introduces provider-specific core knowledge should be
a deliberate, discussed architectural decision (open an issue first), never an
incidental part of another PR.

## License

By contributing you agree that your contributions are licensed under the
project's [MIT license](./LICENSE).
