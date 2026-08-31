# Architecture

Agent Sudo is a single-responsibility library: **given an `AuthorizationRequest`
and a `PolicySet`, return an `AuthorizationResult`.** Everything else — mapping
runtime payloads, enforcing the decision, running tools, orchestrating
approvals — lives outside the package, in code you own.

## Responsibilities and boundaries

| Layer | Owns | Ships in this package |
| --- | --- | --- |
| Agent / runtime | Deciding it wants to perform an action | No |
| Runtime mapper | Translating a runtime-specific payload into an `AuthorizationRequest` | No — see [`integrations.md`](./integrations.md) |
| **Agent Sudo core** (`src/engine.ts`, `src/matcher.ts`, `src/validate.ts`, `src/types.ts`, `src/errors.ts`) | Validating input, evaluating rules in order, returning a decision | **Yes** |
| `PolicySet` | The rules and the explicit default | No — it is your data |
| Caller enforcement | Acting on `allow` / `deny` / `require_approval` | No |
| Tool execution | Actually performing the action | No |
| Approval path | Handling `require_approval` | No |

The package boundary is enforced by `package.json` `exports`: only the module
surface of [`src/index.ts`](../src/index.ts) is importable. Internal helpers
(`ruleMatches`, `assertValidPolicySet`, `assertValidRequest`) and the CLI entry
point are not reachable from `ai-agent-sudo/...` deep paths.

## A. Overall architecture

```mermaid
flowchart TD
    subgraph runtimes["agent runtimes (not in this package)"]
        R1["OpenAI-style call"]
        R2["MCP-style tools/call"]
        R3["custom agent loop"]
        R4["cron / batch job"]
    end

    subgraph yours["your application (not in this package)"]
        MAP["runtime mappers<br/>payload to AuthorizationRequest"]
        POL["PolicySet<br/>(ordered rules + explicit default)"]
        ENF["caller enforcement<br/>switch on decision"]
    end

    subgraph sudo["Agent Sudo (this package)"]
        V["validate policy + request"]
        EV["evaluate: first matching rule wins"]
        RES["AuthorizationResult<br/>decision, reason, ruleId, source"]
    end

    R1 --> MAP
    R2 --> MAP
    R3 --> MAP
    R4 --> MAP
    MAP --> V
    POL --> V
    V --> EV
    EV --> RES
    RES --> ENF
    ENF -->|allow| TOOL["tool executes"]
    ENF -->|deny| STOP["refused"]
    ENF -->|require_approval| APPROVE["approval path"]

    style sudo fill:#1f2937,color:#fff,stroke:#111
    style ENF fill:#fef3c7,stroke:#d97706,color:#111
```

Agent Sudo receives **data only**. It is never handed the tool, the runtime
object, or a callback, so it cannot execute anything even by accident.

## B. Cross-runtime architecture

Different runtimes name the same operation differently. Normalizing that is
per-application work, so it lives in per-application mapper code — not in the
authorization core.

```mermaid
flowchart LR
    A["OpenAI-style<br/>crm_delete_customer"] --> M
    B["MCP-style<br/>crm.delete-contact"] --> M
    C["custom runtime<br/>deleteCustomer()"] --> M
    D["DRUID-style runtime mapping<br/>(conceptual, not an implemented adapter)"] --> M
    M["application-owned mapping<br/>action = delete_customer"] --> REQ["same canonical<br/>AuthorizationRequest"]
    REQ --> ENG{{"same PolicySet<br/>+ Agent Sudo"}}
    ENG --> DEC["same decision"]

    style ENG fill:#1f2937,color:#fff,stroke:#111
```

"DRUID-style" here means *a conceptual runtime whose payloads you would map the
same way* — there is no implemented or official DRUID adapter, and none is
planned. The point of the diagram is that **any** runtime reduces to the same
canonical request, after which one policy and one engine decide.

The runnable proof of this for the OpenAI-style and MCP-style shapes is
[`examples/cross-runtime/`](../examples/cross-runtime/) (`npm run
example:cross-runtime`).

## C. Internal decision flow

```mermaid
flowchart TD
    IN["check(policy, request)<br/>or sudo.check(request)"] --> VP["assertValidPolicySet"]
    VP -->|invalid| EP["throw InvalidPolicySetError"]
    VP -->|valid| VR["assertValidRequest"]
    VR -->|invalid| ER["throw InvalidRequestError"]
    VR -->|valid| L["for each rule, in declared order"]
    L --> MATCH{"every present<br/>match criterion<br/>satisfied?"}
    MATCH -->|yes| HIT["result: rule.decision<br/>source = 'rule', ruleId = rule.id"]
    MATCH -->|no| NEXT["next rule"]
    NEXT --> L
    L -->|no rule matched| DEF["result: defaultDecision<br/>source = 'default', ruleId = null"]

    style EP fill:#7f1d1d,color:#fff
    style ER fill:#7f1d1d,color:#fff
```

`createSudo(policy)` runs `assertValidPolicySet` and then `structuredClone`s the
policy once. Subsequent `sudo.check(request)` calls validate only the request and
evaluate against the private snapshot, so mutating the original policy object
after binding cannot change how that `Sudo` decides.

## The CLI is just another caller

[`src/cli.ts`](../src/cli.ts) is a thin wrapper: it reads JSON files, calls the
**same** `createSudo` / `check` from `src/index.ts`, and prints the result. It
contains no matching or validation logic of its own, so `agent-sudo check` and a
programmatic `check(policy, request)` are identical by construction.

```mermaid
flowchart LR
    subgraph cli["agent-sudo CLI"]
        ARGV["argv"] --> JP["read files + JSON.parse"]
        JP --> CALL["createSudo / check<br/>(imported from src/index.ts)"]
        CALL --> OUT["stdout: AuthorizationResult JSON<br/>exit 0 for any decision"]
    end
    style cli fill:#f1f5f9,stroke:#64748b,color:#111
```

## Design constraints

- **Zero network.** No `fetch`, no sockets, no DNS. An authorization decision is
  a pure function of its inputs.
- **Zero runtime dependencies.** The entire engine is a few hundred lines of
  standard TypeScript.
- **Synchronous-capable.** `check` returns a value, not a promise. It can run on
  the hot path immediately before a tool call.
- **JSON-shaped throughout.** Requests, policies, and results are all
  JSON-compatible, so they can cross a process or API boundary later without a
  redesign.
