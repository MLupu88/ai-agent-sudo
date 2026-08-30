import assert from "node:assert/strict";
import { test } from "node:test";

import {
  check,
  createSudo,
  InvalidPolicySetError,
  InvalidRequestError,
} from "../src/index.ts";
import type { PolicySet } from "../src/index.ts";

const validRequest = {
  actor: { id: "agent-a" },
  action: { name: "read_file" },
};

function withPolicy(overrides: unknown): unknown {
  return overrides;
}

test("missing defaultDecision does not fail open — it throws", () => {
  const broken = withPolicy({
    rules: [],
    defaultReason: "…",
  });
  assert.throws(
    () => check(broken as PolicySet, validRequest),
    InvalidPolicySetError,
  );
  assert.throws(
    () => createSudo(broken as PolicySet),
    InvalidPolicySetError,
  );
});

test("invalid defaultDecision value throws", () => {
  const broken = withPolicy({
    rules: [],
    defaultDecision: "maybe",
    defaultReason: "…",
  });
  assert.throws(
    () => check(broken as PolicySet, validRequest),
    InvalidPolicySetError,
  );
});

test("missing defaultReason throws", () => {
  const broken = withPolicy({ rules: [], defaultDecision: "deny" });
  assert.throws(
    () => check(broken as PolicySet, validRequest),
    InvalidPolicySetError,
  );
});

test("non-array rules throws", () => {
  const broken = withPolicy({
    rules: {},
    defaultDecision: "deny",
    defaultReason: "…",
  });
  assert.throws(
    () => check(broken as PolicySet, validRequest),
    InvalidPolicySetError,
  );
});

test("malformed rule (bad decision, empty id, unknown match key) throws", () => {
  for (const badRule of [
    { id: "", match: {}, decision: "deny", reason: "r" },
    { id: "x", match: {}, decision: "nope", reason: "r" },
    { id: "x", match: {}, decision: "deny", reason: "" },
    { id: "x", match: { actorId: 5 }, decision: "deny", reason: "r" },
    { id: "x", match: { unknownKey: "y" }, decision: "deny", reason: "r" },
    { id: "x", match: "not-an-object", decision: "deny", reason: "r" },
  ]) {
    const broken = withPolicy({
      rules: [badRule],
      defaultDecision: "deny",
      defaultReason: "…",
    });
    assert.throws(
      () => check(broken as PolicySet, validRequest),
      InvalidPolicySetError,
      `expected throw for rule: ${JSON.stringify(badRule)}`,
    );
  }
});

test("duplicate rule ids throw", () => {
  const broken = withPolicy({
    rules: [
      { id: "dup", match: {}, decision: "allow", reason: "r" },
      { id: "dup", match: {}, decision: "deny", reason: "r" },
    ],
    defaultDecision: "deny",
    defaultReason: "…",
  });
  assert.throws(
    () => check(broken as PolicySet, validRequest),
    InvalidPolicySetError,
  );
});

test("a request missing actor.id or action.name throws instead of matching a wildcard", () => {
  const wildcardAllow: PolicySet = {
    rules: [{ id: "all", match: {}, decision: "allow", reason: "allow all" }],
    defaultDecision: "deny",
    defaultReason: "…",
  };
  assert.throws(
    () => check(wildcardAllow, { action: { name: "x" } } as never),
    InvalidRequestError,
  );
  assert.throws(
    () => check(wildcardAllow, { actor: { id: "a" } } as never),
    InvalidRequestError,
  );
});

test("malformed known request fields throw even when defaultDecision is 'allow'", () => {
  // A permissive policy: if validation were skipped, a malformed request would
  // match nothing and fall through to this allow default. It must not.
  const allowByDefault: PolicySet = {
    rules: [
      {
        id: "deny-secrets",
        match: { resourceType: "secret" },
        decision: "deny",
        reason: "no secrets",
      },
    ],
    defaultDecision: "allow",
    defaultReason: "permitted unless a rule says otherwise",
  };

  const sudo = createSudo(allowByDefault);

  const malformed: unknown[] = [
    null,
    "nope",
    { action: { name: "read_file" } }, // missing actor
    { actor: "agent-a", action: { name: "read_file" } }, // actor not an object
    { actor: { id: "" }, action: { name: "read_file" } }, // empty actor.id
    { actor: { id: 7 }, action: { name: "read_file" } }, // actor.id not a string
    { actor: { id: "a" } }, // missing action
    { actor: { id: "a" }, action: "read_file" }, // action not an object
    { actor: { id: "a" }, action: { name: "" } }, // empty action.name
    { actor: { id: "a" }, action: { name: 1 } }, // action.name not a string
    { actor: { id: "a" }, action: { name: "x" }, resource: "secret" }, // resource not an object
    { actor: { id: "a" }, action: { name: "x" }, resource: { type: 5 } }, // resource.type not a string
    { actor: { id: "a" }, action: { name: "x" }, resource: { id: 5 } }, // resource.id not a string
    { actor: { id: "a" }, action: { name: "x" }, context: "prod" }, // context not an object
    { actor: { id: "a" }, action: { name: "x" }, context: ["prod"] }, // context is an array
    { actor: { id: "a" }, action: { name: "x" }, context: { fn: () => 1 } }, // non-JSON value
    { actor: { id: "a" }, action: { name: "x" }, context: { n: Number.NaN } }, // non-finite number
    { actor: { id: "a" }, action: { name: "x" }, context: { when: new Date() } }, // class instance
    { actor: { id: "a" }, action: { name: "x" }, context: { nested: { bad: undefined } } }, // undefined deep value
  ];

  for (const request of malformed) {
    assert.throws(
      () => sudo.check(request as never),
      InvalidRequestError,
      `expected InvalidRequestError for: ${JSON.stringify(request) ?? String(request)}`,
    );
    assert.throws(
      () => check(allowByDefault, request as never),
      InvalidRequestError,
    );
  }

  // A well-formed request against the same permissive policy still reaches allow.
  const ok = sudo.check({
    actor: { id: "a" },
    action: { name: "read_file" },
    resource: { type: "file", id: "notes.txt" },
    context: { env: "prod", tags: ["x"], meta: { tries: 2 } },
  });
  assert.equal(ok.decision, "allow");
  assert.equal(ok.source, "default");
});

test("a well-formed minimal policy set is accepted", () => {
  const ok: PolicySet = {
    rules: [],
    defaultDecision: "require_approval",
    defaultReason: "nothing configured yet",
  };
  const result = check(ok, validRequest);
  assert.equal(result.decision, "require_approval");
  assert.equal(result.source, "default");
});
