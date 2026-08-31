/**
 * Cross-runtime proof: SAME POLICY, DIFFERENT RUNTIMES.
 *
 *   OpenAI-style call ─┐
 *                      ├─ runtime mapper → AuthorizationRequest → Agent Sudo
 *   MCP-style call ────┘                            │
 *                                                   ↓
 *                                   ALLOW / DENY / REQUIRE_APPROVAL
 *
 * Four semantically equivalent attempted actions are expressed in two
 * materially different runtime envelopes (see `openai-style.ts` /
 * `mcp-style.ts`), mapped into `AuthorizationRequest`s by each runtime's own
 * mapper, and evaluated by ONE `Sudo` bound to ONE shared `PolicySet`.
 *
 * The proof asserts that for each action both runtimes produce the same
 * `decision`, `ruleId`, `source` AND `reason`. Any disagreement — between the
 * runtimes, or against the expected semantics — exits non-zero.
 *
 * Agent Sudo never receives an executable function and never runs a tool. The
 * mappers translate data only.
 *
 * Run:  npm run example:cross-runtime
 */

import { createSudo } from "../../src/index.ts";
import type { AuthorizationRequest, AuthorizationResult } from "../../src/index.ts";
import { sharedPolicy } from "./shared-policy.ts";
import { openAiToolCallToRequest, type OpenAiToolCall } from "./openai-style.ts";
import { mcpToolCallToRequest, type McpCallToolRequest } from "./mcp-style.ts";

// ─── one policy, one checker, both runtimes ────────────────────────────────
// This is the only PolicySet in the proof. Neither runtime module imports it
// (grep-provable) — they cannot translate, weaken, or fork the policy.
const sudo = createSudo(sharedPolicy);

const OPENAI_AGENT = { agentId: "openai-assistant-7", env: "production" };
const MCP_SESSION = { clientId: "mcp-client-3", env: "production" };

interface Scenario {
  label: string;
  openai: OpenAiToolCall;
  mcp: McpCallToolRequest;
  expect: Pick<AuthorizationResult, "decision" | "ruleId" | "source">;
}

const scenarios: Scenario[] = [
  {
    label: "read a CRM customer",
    openai: {
      id: "call_1",
      type: "function",
      function: {
        name: "crm_lookup_customer",
        arguments: JSON.stringify({ customer_id: "cus_100" }),
      },
    },
    mcp: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "crm.get-customer", arguments: { customerId: "cus_100" } },
    },
    expect: { decision: "allow", ruleId: "allow-crm-read", source: "rule" },
  },
  {
    label: "delete a customer / contact",
    openai: {
      id: "call_2",
      type: "function",
      function: {
        name: "crm_delete_customer",
        arguments: JSON.stringify({ customer_id: "cus_100" }),
      },
    },
    mcp: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "crm.delete-contact",
        arguments: { customerId: "cus_100" },
      },
    },
    expect: {
      decision: "deny",
      ruleId: "deny-customer-deletion",
      source: "rule",
    },
  },
  {
    label: "send external email in production",
    openai: {
      id: "call_3",
      type: "function",
      function: {
        name: "email_send",
        arguments: JSON.stringify({
          draft_id: "msg_9",
          recipient_type: "external",
          to: "lead@example.com",
        }),
      },
    },
    mcp: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "mail.send",
        arguments: {
          messageId: "msg_9",
          recipientScope: "external",
          to: "lead@example.com",
        },
      },
    },
    expect: {
      decision: "require_approval",
      ruleId: "approve-prod-external-email",
      source: "rule",
    },
  },
  {
    label: "unmapped / unknown action",
    openai: {
      id: "call_4",
      type: "function",
      function: { name: "crm_export_all", arguments: "{}" },
    },
    mcp: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "crm.bulk-export", arguments: {} },
    },
    expect: { decision: "deny", ruleId: null, source: "default" },
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtRequest(r: AuthorizationRequest): string {
  const resource = r.resource
    ? ` resource=${r.resource.type ?? "?"}:${r.resource.id ?? "?"}`
    : "";
  const context = r.context ? ` context=${JSON.stringify(r.context)}` : "";
  return `actor=${r.actor.id} action=${r.action.name}${resource}${context}`;
}

function fmtResult(r: AuthorizationResult): string {
  return `${r.decision} | ruleId=${r.ruleId ?? "null"} | source=${r.source}`;
}

function sameResult(a: AuthorizationResult, b: AuthorizationResult): boolean {
  return (
    a.decision === b.decision &&
    a.ruleId === b.ruleId &&
    a.source === b.source &&
    a.reason === b.reason
  );
}

function matchesExpected(
  r: AuthorizationResult,
  expect: Scenario["expect"],
): boolean {
  return (
    r.decision === expect.decision &&
    r.ruleId === expect.ruleId &&
    r.source === expect.source
  );
}

// ─── the proof ────────────────────────────────────────────────────────────

console.log("shared PolicySet (used unchanged by both runtimes):");
console.log(
  `  rules: [${sharedPolicy.rules.map((rule) => rule.id).join(", ")}]`,
);
console.log(`  default: ${sharedPolicy.defaultDecision}\n`);

let failures = 0;

for (const scenario of scenarios) {
  const openAiRequest = openAiToolCallToRequest(scenario.openai, OPENAI_AGENT);
  const mcpRequest = mcpToolCallToRequest(scenario.mcp, MCP_SESSION);

  const openAiResult = sudo.check(openAiRequest);
  const mcpResult = sudo.check(mcpRequest);

  const agree = sameResult(openAiResult, mcpResult);
  const asExpected =
    matchesExpected(openAiResult, scenario.expect) &&
    matchesExpected(mcpResult, scenario.expect);
  const ok = agree && asExpected;
  if (!ok) failures += 1;

  console.log(`${ok ? "✓" : "✗"} ${scenario.label}`);
  console.log(
    `    OpenAI-style  ${scenario.openai.function.name}(${scenario.openai.function.arguments})`,
  );
  console.log(`      → ${fmtRequest(openAiRequest)}`);
  console.log(`      → ${fmtResult(openAiResult)}`);
  console.log(
    `    MCP-style     ${scenario.mcp.params.name}(${JSON.stringify(scenario.mcp.params.arguments)})`,
  );
  console.log(`      → ${fmtRequest(mcpRequest)}`);
  console.log(`      → ${fmtResult(mcpResult)}`);
  console.log(`    shared-policy reason: "${openAiResult.reason}"`);
  if (!agree) {
    console.log("    ✗ MISMATCH: the two runtimes produced different decisions");
  }
  if (!asExpected) {
    console.log("    ✗ MISMATCH: decision differs from expected semantics");
  }
  console.log();
}

// ─── secondary: what the caller does after the decision ───────────────────
// Agent Sudo executed nothing above. The caller — not Agent Sudo — acts here.
const caller: Record<AuthorizationResult["decision"], string> = {
  allow: "caller invokes the tool",
  deny: "caller refuses; the tool never runs",
  require_approval: "caller routes to a human; the tool never runs",
};
const sample = sudo.check(
  openAiToolCallToRequest(scenarios[0]!.openai, OPENAI_AGENT),
);
console.log(
  `caller boundary (secondary): "${sample.decision}" → ${caller[sample.decision]}\n`,
);

// ─── verdict ─────────────────────────────────────────────────────────────
const passed = scenarios.length - failures;
console.log(
  `${failures === 0 ? "PASS" : "FAIL"}: ${passed}/${scenarios.length} cross-runtime equivalences held`,
);

if (failures > 0) {
  process.exit(1);
}
