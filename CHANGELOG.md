# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

_Nothing yet._

## 0.1.0 — 2026-08-31

Initial public release.

### Authorization core

- Deterministic, synchronous, LLM-free, network-free authorization engine.
- Three outcomes only: `allow`, `deny`, `require_approval`. `require_approval` is
  never upgraded to `allow`.
- `AuthorizationRequest` shape: `actor`, `action`, optional `resource`, optional
  `context`.
- `AuthorizationResult`: `decision`, `reason`, `ruleId`, `source` (`"rule"` |
  `"default"`) — every decision is explainable.
- `PolicySet`: an ordered list of rules plus a **required explicit default**
  (`defaultDecision` + `defaultReason`). No implicit allow.
- `RuleMatch` criteria: `actorId`, `action`, `resourceType`, `resourceId`,
  `context` — exact equality and "any of" (arrays) only. Logical AND across
  present criteria; absent criteria are wildcards; `{}` matches everything.
- Rules evaluated in **declared order; first match wins.** No specificity
  scoring.
- Structurally invalid policy or request throws `InvalidPolicySetError` /
  `InvalidRequestError` — never fails open, even when `defaultDecision` is
  `allow`.
- `createSudo(policy)` validates once and snapshots the policy (`structuredClone`)
  so later mutation of the caller's object cannot change evaluation;
  `check(policy, request)` is a one-shot form.

### Package

- Zero runtime dependencies. ESM only. Node ≥ 22.
- Public API: `check`, `createSudo`, `InvalidPolicySetError`,
  `InvalidRequestError`, and the model types.
- `exports` restricted to the package root; internal modules and the CLI are not
  importable as subpaths.
- TypeScript declarations shipped; verified against TypeScript 5.7 and 5.9 with
  `skipLibCheck: false` under `nodenext` / `bundler` resolution.

### CLI

- `agent-sudo` binary: `validate <policy.json>`, `check <policy.json>
  <request.json>`, `--help`.
- Delegates to the same library validation and engine — no duplicated policy
  logic.
- `check` prints the `AuthorizationResult` as JSON and **exits 0 for every
  decision**. Exit `1` for unreadable file / malformed JSON / invalid policy or
  request; exit `2` for usage errors.

### JSON policies

- Policies can be authored as plain JSON files using the exact `PolicySet`
  structure.
- Example `crm-policy.json` plus four request files covering allow / deny /
  require_approval / default-deny.

### Proofs & guidance

- Runnable integration example (`npm run example`) demonstrating all three
  outcomes with the caller — not Agent Sudo — invoking the tool.
- Runnable cross-runtime proof (`npm run example:cross-runtime`): OpenAI-style and
  MCP-style envelopes mapped into one shared `PolicySet` and asserted to produce
  identical decisions.
- `docs/integration-contract.md`: canonical vocabulary ownership and mapper
  conformance-testing guidance.

### Documentation

- Reworked README, plus `docs/architecture.md`, `docs/authorization-model.md`,
  `docs/security.md`, `docs/integrations.md`, `docs/testing.md`.
- `SECURITY.md`, `CONTRIBUTING.md`, MIT `LICENSE`.
- GitHub Actions CI (Node 22.x + 24.x).
