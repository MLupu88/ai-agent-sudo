import assert from "node:assert/strict";
import { test } from "node:test";

// `ruleMatches` is an internal implementation detail (not exported from the
// package root); the matcher unit tests import it directly.
import { ruleMatches } from "../src/matcher.ts";
import type { AuthorizationRequest, RuleMatch } from "../src/types.ts";

const baseRequest: AuthorizationRequest = {
  actor: { id: "agent-a" },
  action: { name: "read_file" },
};

test("empty match criteria matches every request", () => {
  assert.equal(ruleMatches({}, baseRequest), true);
});

test("actor matching: single value and array membership", () => {
  assert.equal(ruleMatches({ actorId: "agent-a" }, baseRequest), true);
  assert.equal(ruleMatches({ actorId: "agent-b" }, baseRequest), false);
  assert.equal(
    ruleMatches({ actorId: ["agent-b", "agent-a"] }, baseRequest),
    true,
  );
});

test("action matching", () => {
  assert.equal(ruleMatches({ action: "read_file" }, baseRequest), true);
  assert.equal(ruleMatches({ action: "write_file" }, baseRequest), false);
});

test("resource matching requires the resource field to be present", () => {
  const withResource: AuthorizationRequest = {
    ...baseRequest,
    resource: { type: "secret", id: "db-password" },
  };
  assert.equal(ruleMatches({ resourceType: "secret" }, withResource), true);
  assert.equal(ruleMatches({ resourceId: "db-password" }, withResource), true);
  assert.equal(ruleMatches({ resourceType: "file" }, withResource), false);

  // absent resource -> a resource criterion cannot match
  assert.equal(ruleMatches({ resourceType: "secret" }, baseRequest), false);
});

test("context matching: equality and set membership", () => {
  const request: AuthorizationRequest = {
    ...baseRequest,
    context: { env: "production", attempt: 2, dryRun: false },
  };
  assert.equal(ruleMatches({ context: { env: "production" } }, request), true);
  assert.equal(ruleMatches({ context: { env: "staging" } }, request), false);
  assert.equal(
    ruleMatches({ context: { env: ["staging", "production"] } }, request),
    true,
  );
  assert.equal(ruleMatches({ context: { attempt: 2 } }, request), true);
  assert.equal(ruleMatches({ context: { dryRun: false } }, request), true);

  // multiple context keys are AND-ed
  assert.equal(
    ruleMatches({ context: { env: "production", dryRun: false } }, request),
    true,
  );
  assert.equal(
    ruleMatches({ context: { env: "production", dryRun: true } }, request),
    false,
  );
});

test("context criterion fails when context or key is absent", () => {
  assert.equal(ruleMatches({ context: { env: "production" } }, baseRequest), false);
  const partial: AuthorizationRequest = {
    ...baseRequest,
    context: { region: "eu" },
  };
  assert.equal(ruleMatches({ context: { env: "production" } }, partial), false);
});

test("all present criteria must match (logical AND)", () => {
  const match: RuleMatch = { actorId: "agent-a", action: "read_file" };
  assert.equal(ruleMatches(match, baseRequest), true);
  assert.equal(
    ruleMatches({ ...match, action: "delete_file" }, baseRequest),
    false,
  );
});
