/**
 * Agent Sudo in front of ordinary application actions.
 *
 *   agent / application proposes an action
 *            │
 *            ▼
 *     sudo.check({ actor, action, resource, context })
 *            │
 *            ▼
 *     allow  |  deny  |  require_approval
 *            │
 *            ▼
 *     THE CALLER (this file) decides what happens next
 *
 * Agent Sudo returns a decision and nothing else. It never touches the fake
 * tools below — only the `allow` branch of the caller's own switch does.
 *
 * Run:  npm run example
 */

import { createSudo } from "../src/index.ts";
import type { AuthorizationRequest, Decision, PolicySet } from "../src/index.ts";

// --- fake CRM tools: they live ONLY in this example, never in Agent Sudo ------

const crm = {
  sendEmail(to: string, subject: string): void {
    console.log(`      📧 tool ran: email to ${to} — "${subject}"`);
  },
  updateContact(id: string, patch: Record<string, string>): void {
    console.log(`      ✏️  tool ran: contact ${id} <- ${JSON.stringify(patch)}`);
  },
  deleteContact(id: string): void {
    console.log(`      🗑️  tool ran: contact ${id} deleted`);
  },
};

// --- policy (plain JSON, declared order, explicit default) --------------------

const policy: PolicySet = {
  rules: [
    {
      id: "deny-contact-deletion",
      match: { action: "delete_contact" },
      decision: "deny",
      reason: "agents may never delete CRM contacts",
    },
    {
      id: "approve-prod-email",
      match: { action: "send_email", context: { env: "production" } },
      decision: "require_approval",
      reason: "outbound email in production needs human sign-off",
    },
    {
      id: "allow-sales-contact-updates",
      match: { actorId: "sales-agent", action: "update_contact" },
      decision: "allow",
      reason: "sales-agent is trusted to edit contact records",
    },
  ],
  defaultDecision: "deny",
  defaultReason: "no rule permits this action",
};

const sudo = createSudo(policy);

// --- the integration boundary -----------------------------------------------

const seen = new Set<Decision>();

/**
 * Propose an action, ask Agent Sudo, then — as the caller — decide what to do.
 * `runTool` is the caller's own closure; it is invoked only on `allow`.
 */
function proposeAndRun(request: AuthorizationRequest, runTool: () => void): void {
  const result = sudo.check(request);
  seen.add(result.decision);

  const where = result.source === "rule" ? `rule "${result.ruleId}"` : "default";
  console.log(
    `\n• ${request.actor.id} wants to ${request.action.name}` +
      (request.context ? ` (context: ${JSON.stringify(request.context)})` : ""),
  );
  console.log(`  → ${result.decision.toUpperCase()} [${where}] — ${result.reason}`);

  switch (result.decision) {
    case "allow":
      console.log("  caller: permitted — invoking the tool");
      runTool();
      return;
    case "deny":
      console.log("  caller: refused — the tool is not invoked");
      return;
    case "require_approval":
      console.log(
        "  caller: halted — routing to an approval path before anything runs",
      );
      return;
  }
}

// --- scenarios: all three outcomes + the explicit default -------------------

proposeAndRun(
  {
    actor: { id: "sales-agent" },
    action: { name: "update_contact" },
    resource: { type: "contact", id: "c-42" },
    context: { env: "staging" },
  },
  () => crm.updateContact("c-42", { stage: "qualified" }),
);

proposeAndRun(
  {
    actor: { id: "sales-agent" },
    action: { name: "send_email" },
    resource: { type: "email", id: "welcome-seq-1" },
    context: { env: "production" },
  },
  () => crm.sendEmail("lead@example.com", "Welcome aboard"),
);

proposeAndRun(
  {
    actor: { id: "support-agent" },
    action: { name: "delete_contact" },
    resource: { type: "contact", id: "c-42" },
  },
  () => crm.deleteContact("c-42"),
);

proposeAndRun(
  {
    actor: { id: "sales-agent" },
    action: { name: "export_all_contacts" },
  },
  () => console.log("      (never reached)"),
);

// --- make this usable as a smoke test --------------------------------------

const expected: Decision[] = ["allow", "deny", "require_approval"];
const missing = expected.filter((d) => !seen.has(d));
if (missing.length > 0) {
  console.error(`\nFAILED: outcomes not demonstrated: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("\nOK: allow, deny and require_approval all demonstrated.");
