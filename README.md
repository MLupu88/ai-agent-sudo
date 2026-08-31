# AI Agent Sudo

A tiny, provider-neutral **authorization layer for AI agents**.

It sits immediately before a tool or action runs and answers one question:

> May this **actor** perform this **action**, on this **resource**, in this **context**?

The answer is one of exactly three outcomes:

| decision           | meaning                                              |
| ------------------ | --------------------------------------------------- |
| `allow`            | proceed                                             |
| `deny`             | do not proceed                                      |
| `require_approval` | do not proceed until a human (or higher authority) approves |

Agent Sudo returns a decision. **It never executes the action**, never calls an
LLM, never touches the network, and never turns `require_approval` into `allow`.

## Where it sits

```
agent decides to call a tool
        │
        ▼
  sudo.check({ actor, action, resource, context })   ◄── Agent Sudo (this library)
        │
        ├── "allow"            → runtime executes the tool
        ├── "deny"             → runtime refuses
        └── "require_approval" → runtime routes to an approval path
```

Your agent / runtime asks Agent Sudo for a decision and then decides what to do
with it. Agent Sudo has no opinion about how tools run or how approvals happen.

## Why it exists

Agents call tools. Some of those calls should not happen automatically. Today
that logic gets scattered through prompt text, ad-hoc `if` statements, and
framework-specific hooks. Agent Sudo is a small, explicit, testable place to put
it — one deterministic contract that works the same in front of Claude, OpenAI,
LangChain, a custom agent, or an MCP-based system, without depending on any of
them.

## What it deliberately is not

Not an agent framework, not a runtime, not an orchestration or observability or
audit platform, not an enterprise governance suite, not an LLM policy judge, not
a tool-execution service, not an approval UI, not a hosted service. No database,
no server, no telemetry. Just a library and a small contract.

## Install

```bash
npm install ai-agent-sudo
```

Zero runtime dependencies. Requires Node >= 22. TypeScript consumers need
TypeScript >= 5.7 (the shipped declarations use modern relative-import
resolution).

## Usage

```ts
import { createSudo } from "ai-agent-sudo";
import type { PolicySet } from "ai-agent-sudo";

const policy: PolicySet = {
  rules: [
    // Order matters: first match wins. `deny-secrets` is placed before
    // `allow-reads` on purpose — otherwise a `read_file` against a `secret`
    // resource would match the broad allow rule first and never reach the deny.
    {
      id: "deny-secrets",
      match: { resourceType: "secret" },
      decision: "deny",
      reason: "agents never touch secrets",
    },
    {
      id: "allow-reads",
      match: { action: "read_file" },
      decision: "allow",
      reason: "reading files is safe",
    },
    {
      id: "approve-prod-email",
      match: { action: "send_email", context: { env: "production" } },
      decision: "require_approval",
      reason: "outbound email in production needs a human",
    },
  ],
  defaultDecision: "deny",
  defaultReason: "no rule permitted this action",
};

const sudo = createSudo(policy);

const result = sudo.check({
  actor: { id: "agent-7" },
  action: { name: "send_email" },
  resource: { type: "email", id: "welcome" },
  context: { env: "production" },
});

result.decision; // "require_approval"
result.reason;   // "outbound email in production needs a human"
result.ruleId;   // "approve-prod-email"  (null when the default was used)
result.source;   // "rule"                ("default" when nothing matched)
```

A one-shot form is also exported: `check(policy, request)`.

## Integrating in front of a tool call

Agent Sudo sits between "the agent wants to do X" and "X happens". It returns a
decision; **the caller** acts on it. Agent Sudo never runs the tool.

```ts
import { createSudo } from "ai-agent-sudo";
import type { AuthorizationRequest } from "ai-agent-sudo";

const sudo = createSudo(policy);

function guardedCall<T>(request: AuthorizationRequest, runTool: () => T) {
  const { decision, reason, ruleId } = sudo.check(request);
  switch (decision) {
    case "allow":
      return runTool(); // the caller invokes the tool
    case "deny":
      throw new Error(`blocked by ${ruleId ?? "default"}: ${reason}`);
    case "require_approval":
      return { status: "pending_approval" as const, reason, ruleId };
  }
}

guardedCall(
  { actor: { id: "sales-agent" }, action: { name: "send_email" }, context: { env: "production" } },
  () => emailClient.send(/* ... */),
);
```

A runnable version covering all three outcomes is in
[`examples/protect-tool-call.ts`](https://github.com/MLupu88/ai-agent-sudo/blob/main/examples/protect-tool-call.ts)
— clone the repo and run `npm run example`.

## Request model

```ts
{
  actor:     { id: string },            // required — an actor must be identifiable
  action:    { name: string },          // required — an action must have a stable name
  resource?: { type?: string; id?: string },
  context?:  Record<string, JsonValue>  // env, tenant, arguments, ...
}
```

Everything is small and JSON-friendly so a request could later cross a
process / API boundary unchanged. Nothing is specific to any AI provider.

## Policy model

A `PolicySet` is an **ordered list of rules** plus an **explicit default**:

```ts
{
  rules: Rule[],
  defaultDecision: "allow" | "deny" | "require_approval",  // required
  defaultReason: string,                                   // required
}
```

Each `Rule`:

```ts
{
  id: string,                 // stable, unique
  match: RuleMatch,           // {} matches everything
  decision: "allow" | "deny" | "require_approval",
  reason: string,             // human-readable
}
```

`RuleMatch` supports a small fixed set of criteria:

```ts
{
  actorId?:      string | string[],
  action?:       string | string[],
  resourceType?: string | string[],
  resourceId?:   string | string[],
  context?:      Record<string, Prim | Prim[]>,  // Prim = string | number | boolean | null
}
```

No expressions, no `eval`, no embedded code, no regex language, no LLM. Just
equality and "any of".

## Matching & precedence

- Rules are evaluated **in declared order. The first matching rule wins.**
- A rule matches when **every** criterion present on its `match` is satisfied
  (logical AND). Absent criteria are wildcards; `match: {}` matches every request.
- String criteria are exact, case-sensitive equality; an array means "any of".
- A `resourceType` / `resourceId` criterion against a request with no such
  resource field does **not** match (the rule is skipped).
- A `context` criterion matches only if the request context contains that key
  with a `===`-equal primitive value (or a value listed in the array).
- If no rule matches, the policy set's **explicit default** is returned, with
  `ruleId: null` and `source: "default"`.

There is no specificity scoring and no implicit effect precedence — only
declared order.

## Safety semantics

- Agent Sudo only returns a decision. It never invokes the requested action.
- `require_approval` is never rewritten to `allow`.
- **There is no implicit allow.** `defaultDecision` / `defaultReason` are
  required.
- A structurally invalid policy set (missing default, malformed rule, duplicate
  ids, unknown `match` key, ...) throws `InvalidPolicySetError` rather than
  being treated as permissive. A request missing `actor.id` or `action.name`
  throws `InvalidRequestError`. It never fails open.

## Scripts

```bash
npm test        # node --test
npm run typecheck
npm run build   # emits dist/
npm run example # runnable integration example
```

Requires Node >= 22. Building and running the tests / example from source uses
Node's native TypeScript execution.

## Status

v0 — deliberately minimal. No license yet.
