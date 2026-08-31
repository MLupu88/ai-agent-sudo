# Testing & verification

Agent Sudo is small enough to verify thoroughly. This document explains what is
tested, where the boundaries are, and how to run each layer.

## Test taxonomy

| Layer | Location | Verifies | Command |
| --- | --- | --- | --- |
| Engine | [`test/engine.test.ts`](../test/engine.test.ts) | `AuthorizationRequest` + `PolicySet` → `AuthorizationResult`: first-match order, explicit default, `require_approval` never upgraded, `createSudo` snapshot isolation | `npm test` |
| Matcher | [`test/matcher.test.ts`](../test/matcher.test.ts) | `RuleMatch` semantics: AND across criteria, wildcards, array "any of", `resource`/`context` absence | `npm test` |
| Validation | [`test/validate.test.ts`](../test/validate.test.ts) | Malformed policy/request throws — never fails open, even with `defaultDecision: "allow"` | `npm test` |
| CLI | [`test/cli.test.ts`](../test/cli.test.ts) | The real `agent-sudo` process: exit codes, stdout/stderr, and that its output equals the library's `check()` for the same inputs | `npm test` |
| Integration example | [`examples/protect-tool-call.ts`](../examples/protect-tool-call.ts) | All three outcomes demonstrated end to end; the fake tool runs only on `allow` | `npm run example` |
| Cross-runtime proof | [`examples/cross-runtime/`](../examples/cross-runtime/) | Two runtime shapes → one shared `PolicySet` → identical `decision`/`ruleId`/`source`/`reason`; exits non-zero on any mismatch | `npm run example:cross-runtime` |

Run everything the release gate runs:

```bash
npm run release:check
```

which chains: `npm test` → `npm run typecheck` → `npm run build` →
`npm run example` → `npm run example:cross-runtime` → `npm pack --dry-run`.

## Two independent responsibilities, two independent test suites

The single most important testing idea in this project:

```mermaid
flowchart LR
    P["runtime payload"] -->|your mapper| R["AuthorizationRequest"]
    R -->|Agent Sudo engine| D["AuthorizationResult"]

    subgraph yours["YOUR conformance tests"]
        P -. assert.deepEqual .-> R
    end
    subgraph sudo["Agent Sudo's own tests"]
        R -. assert.deepEqual .-> D
    end
```

- **Mapper conformance tests** (you write these, in your codebase) verify
  *mapping*: a given runtime payload becomes exactly the right
  `AuthorizationRequest`.
- **Agent Sudo's tests** (in this repo) verify *authorization*: a given
  `AuthorizationRequest` + `PolicySet` produces exactly the right
  `AuthorizationResult`.

Keep them separate. Agent Sudo has no "conformance engine" and needs none — a
conformance test is just `assert.deepEqual` on your mapper's output. Full guidance
and an example: [`integration-contract.md`](./integration-contract.md#mapper-conformance-testing).

## Clean-consumer / package verification

Before a release, the package is verified as an *installed dependency*, not just
from source:

```bash
npm pack                                   # produces ai-agent-sudo-<version>.tgz
mkdir /tmp/consumer && cd /tmp/consumer
npm init -y && npm pkg set type=module
npm install /path/to/ai-agent-sudo-<version>.tgz
```

Then check:

- **Library** — `import { createSudo, check } from "ai-agent-sudo"` works;
  `allow` / `deny` / `require_approval` / default all evaluate correctly.
- **CLI** — `npx agent-sudo --help`, `validate`, and `check` work; `deny` exits
  `0`; an invalid policy and a malformed request exit non-zero.
- **Package shape** — zero runtime dependencies; only `dist/`, `README.md`,
  `LICENSE`, `CHANGELOG.md`, `package.json` are shipped; `src/`, `test/`,
  `examples/`, `docs/` are **not** shipped.
- **Deep imports blocked** — `import "ai-agent-sudo/dist/engine.js"` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## TypeScript declaration compatibility

The emitted `dist/*.d.ts` files use relative import specifiers with a `.ts`
extension (e.g. `from "./types.ts"`). Under `nodenext` / `node16` / `bundler`
module resolution, TypeScript strips the `.ts` and resolves to the sibling
`.d.ts`, so this is transparent to consumers.

Verified with a clean consumer, `skipLibCheck: false`:

| Consumer TypeScript | `moduleResolution` | Result |
| --- | --- | --- |
| 5.9 | `nodenext` | ✅ |
| 5.7 | `nodenext` | ✅ |
| 5.9 / 5.7 | `bundler` | ✅ |

The supported floor is **TypeScript ≥ 5.7** with `nodenext`, `node16`, or
`bundler` resolution. Legacy `moduleResolution: "node"` (node10) is not
supported — it cannot consume `exports`-only packages in general.

To reproduce:

```bash
npm pack
mkdir /tmp/tsc-consumer && cd /tmp/tsc-consumer
npm init -y && npm pkg set type=module
npm install /path/to/ai-agent-sudo-<version>.tgz typescript@5.7
# tsconfig.json: { "compilerOptions": {
#   "module": "nodenext", "moduleResolution": "nodenext",
#   "strict": true, "skipLibCheck": false, "noEmit": true } }
# import from "ai-agent-sudo" in a .ts file, then:
npx tsc -p tsconfig.json
```

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to
`main` and every pull request:

- **`build` job** — matrix on Node `22.x` and `24.x`: `npm ci`, `npm test`,
  `npm run typecheck`, `npm run build`.
- **`integration` job** — Node `24.x`: `npm run example`,
  `npm run example:cross-runtime`, `npm pack --dry-run`.

Only `actions/checkout` and `actions/setup-node` are used. No third-party CI
services.
