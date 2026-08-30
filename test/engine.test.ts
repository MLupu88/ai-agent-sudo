import assert from "node:assert/strict";
import { test } from "node:test";

import { check, createSudo } from "../src/index.ts";
import type { PolicySet } from "../src/index.ts";

const policySet: PolicySet = {
  rules: [
    {
      id: "allow-a-read",
      match: { actorId: "agent-a", action: "read_file" },
      decision: "allow",
      reason: "agent-a is trusted to read files",
    },
    {
      id: "deny-secret-access",
      match: { resourceType: "secret" },
      decision: "deny",
      reason: "secrets are never exposed to agents",
    },
    {
      id: "approve-prod-email",
      match: { action: "send_email", context: { env: "production" } },
      decision: "require_approval",
      reason: "outbound email in production needs a human",
    },
  ],
  defaultDecision: "deny",
  defaultReason: "no rule allowed this action",
};

test("matching allow rule", () => {
  const result = check(policySet, {
    actor: { id: "agent-a" },
    action: { name: "read_file" },
  });
  assert.deepEqual(result, {
    decision: "allow",
    reason: "agent-a is trusted to read files",
    ruleId: "allow-a-read",
    source: "rule",
  });
});

test("matching deny rule", () => {
  const result = check(policySet, {
    actor: { id: "agent-b" },
    action: { name: "read_file" },
    resource: { type: "secret", id: "api-key" },
  });
  assert.equal(result.decision, "deny");
  assert.equal(result.ruleId, "deny-secret-access");
  assert.equal(result.source, "rule");
});

test("matching require_approval rule", () => {
  const result = check(policySet, {
    actor: { id: "agent-a" },
    action: { name: "send_email" },
    context: { env: "production" },
  });
  assert.equal(result.decision, "require_approval");
  assert.equal(result.ruleId, "approve-prod-email");
});

test("no matching rule uses the explicit default (distinguishable from a rule)", () => {
  const result = check(policySet, {
    actor: { id: "agent-z" },
    action: { name: "do_something_unknown" },
  });
  assert.deepEqual(result, {
    decision: "deny",
    reason: "no rule allowed this action",
    ruleId: null,
    source: "default",
  });
});

test("declared rule order determines precedence (first match wins)", () => {
  const ordered: PolicySet = {
    rules: [
      {
        id: "first-allow",
        match: { action: "deploy" },
        decision: "allow",
        reason: "first rule wins",
      },
      {
        id: "second-deny",
        match: { action: "deploy" },
        decision: "deny",
        reason: "never reached",
      },
    ],
    defaultDecision: "deny",
    defaultReason: "default",
  };
  const forward = check(ordered, {
    actor: { id: "agent-a" },
    action: { name: "deploy" },
  });
  assert.equal(forward.decision, "allow");
  assert.equal(forward.ruleId, "first-allow");

  // reversing the declared order flips the outcome — nothing else changes
  const reversed: PolicySet = {
    ...ordered,
    rules: [...ordered.rules].reverse(),
  };
  const backward = check(reversed, {
    actor: { id: "agent-a" },
    action: { name: "deploy" },
  });
  assert.equal(backward.decision, "deny");
  assert.equal(backward.ruleId, "second-deny");
});

test("absence of optional resource / context behaves predictably", () => {
  // rule needs a resource; request has none -> rule skipped, falls through to default
  const result = check(policySet, {
    actor: { id: "agent-b" },
    action: { name: "read_file" },
  });
  assert.equal(result.source, "default");
  assert.equal(result.decision, "deny");

  // rule needs context env=production; request has no context -> skipped
  const noCtx = check(policySet, {
    actor: { id: "agent-b" },
    action: { name: "send_email" },
  });
  assert.equal(noCtx.source, "default");
});

test("createSudo binds a policy set and evaluates the same way", () => {
  const sudo = createSudo(policySet);
  const result = sudo.check({
    actor: { id: "agent-a" },
    action: { name: "read_file" },
  });
  assert.equal(result.decision, "allow");
});

test("mutating the original policy object after createSudo cannot change behavior", () => {
  const original: PolicySet = {
    rules: [
      {
        id: "allow-a-read",
        match: { actorId: ["agent-a"], action: "read_file", context: { env: ["prod"] } },
        decision: "allow",
        reason: "agent-a may read in prod",
      },
      {
        id: "deny-secret",
        match: { resourceType: "secret" },
        decision: "deny",
        reason: "no secrets",
      },
    ],
    defaultDecision: "require_approval",
    defaultReason: "default",
  };

  const sudo = createSudo(original);

  const request = {
    actor: { id: "agent-a" },
    action: { name: "read_file" },
    resource: { type: "file", id: "notes.txt" },
    context: { env: "prod" },
  };

  const before = sudo.check(request);
  assert.deepEqual(before, {
    decision: "allow",
    reason: "agent-a may read in prod",
    ruleId: "allow-a-read",
    source: "rule",
  });

  // Mutate every nested mutable structure of the caller-owned object.
  original.defaultDecision = "allow";
  original.defaultReason = "mutated default";
  original.rules[0]!.decision = "deny";
  original.rules[0]!.reason = "mutated reason";
  original.rules[0]!.id = "mutated-id";
  (original.rules[0]!.match.actorId as string[]).push("agent-z");
  (original.rules[0]!.match.actorId as string[])[0] = "agent-z";
  original.rules[0]!.match.action = "write_file";
  (original.rules[0]!.match.context!["env"] as string[])[0] = "staging";
  original.rules[0]!.match.resourceType = "secret";
  original.rules.push({
    id: "injected",
    match: {},
    decision: "deny",
    reason: "injected rule",
  });
  original.rules.length = 1;

  const after = sudo.check(request);
  assert.deepEqual(after, before);
});

test("the engine never rewrites require_approval to allow", () => {
  const sudo = createSudo(policySet);
  const result = sudo.check({
    actor: { id: "agent-a" },
    action: { name: "send_email" },
    context: { env: "production" },
  });
  assert.notEqual(result.decision, "allow");
  assert.equal(result.decision, "require_approval");
});
