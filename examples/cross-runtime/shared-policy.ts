/**
 * ONE PolicySet, applied unchanged to requests from every runtime in this
 * directory.
 *
 * This object is the whole point of the cross-runtime proof: the policy belongs
 * to Agent Sudo, not to a particular agent framework. `openai-style.ts` and
 * `mcp-style.ts` do NOT import this file — they only translate their own
 * tool-call envelopes into an `AuthorizationRequest`. The policy is applied
 * once, in `cross-runtime-proof.ts`, to requests coming from both runtimes.
 *
 * Rules are commercially ordinary and evaluated in declared order (first match
 * wins):
 *
 *   1. deleting a customer is always denied
 *   2. sending external email in production needs human approval
 *   3. reading a customer record is allowed
 *   4. anything else -> explicit deny (no implicit allow)
 *
 * The rules only look at `action`, and two context keys (`env`,
 * `recipient_scope`). They never look at which runtime produced the request.
 */

import type { PolicySet } from "../../src/index.ts";
import { CANONICAL_ACTIONS } from "./canonical-actions.ts";

export const sharedPolicy: PolicySet = {
  rules: [
    {
      id: "deny-customer-deletion",
      match: { action: CANONICAL_ACTIONS.deleteCustomer },
      decision: "deny",
      reason: "agents may not delete customer records",
    },
    {
      id: "approve-prod-external-email",
      match: {
        action: CANONICAL_ACTIONS.sendEmail,
        context: { env: "production", recipient_scope: "external" },
      },
      decision: "require_approval",
      reason: "sending external email in production requires human approval",
    },
    {
      id: "allow-crm-read",
      match: { action: CANONICAL_ACTIONS.readCustomer },
      decision: "allow",
      reason: "reading customer records is permitted",
    },
  ],
  defaultDecision: "deny",
  defaultReason: "no rule permits this action",
};
