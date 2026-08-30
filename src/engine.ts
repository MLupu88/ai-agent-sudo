import { ruleMatches } from "./matcher.ts";
import type {
  AuthorizationRequest,
  AuthorizationResult,
  PolicySet,
} from "./types.ts";
import { assertValidPolicySet, assertValidRequest } from "./validate.ts";

/**
 * Deep, dependency-free defensive copy of a validated policy set.
 *
 * A policy set is JSON-compatible by construction (validation guarantees it), so
 * `structuredClone` produces a fully independent tree — rules, `match` objects,
 * string arrays, context match objects and context match arrays are all copied,
 * not shared. After this, mutating the caller-owned object cannot change how a
 * bound `Sudo` evaluates.
 */
function snapshotPolicySet(policySet: PolicySet): PolicySet {
  return structuredClone(policySet);
}

/**
 * Evaluate one request against an already-validated policy set.
 *
 * Precedence: rules are evaluated in declared order and the FIRST matching rule
 * wins. If no rule matches, the policy set's explicit default is returned.
 */
function evaluate(
  policySet: PolicySet,
  request: AuthorizationRequest,
): AuthorizationResult {
  for (const rule of policySet.rules) {
    if (ruleMatches(rule.match, request)) {
      return {
        decision: rule.decision,
        reason: rule.reason,
        ruleId: rule.id,
        source: "rule",
      };
    }
  }

  return {
    decision: policySet.defaultDecision,
    reason: policySet.defaultReason,
    ruleId: null,
    source: "default",
  };
}

/**
 * One-shot check. Validates the policy set and the request on every call, then
 * returns a decision. Throws `InvalidPolicySetError` / `InvalidRequestError`
 * rather than failing open.
 */
export function check(
  policySet: PolicySet,
  request: AuthorizationRequest,
): AuthorizationResult {
  assertValidPolicySet(policySet);
  assertValidRequest(request);
  return evaluate(policySet, request);
}

/** A reusable checker bound to one policy set (validated and snapshotted once). */
export interface Sudo {
  check(request: AuthorizationRequest): AuthorizationResult;
}

/**
 * Bind a policy set to a reusable checker.
 *
 * The policy set is validated and then deep-copied once here; the caller's
 * object is never read again, so later mutation of it — including nested
 * rule / match / context values — cannot affect this instance. Each `check`
 * still validates its request.
 */
export function createSudo(policySet: PolicySet): Sudo {
  assertValidPolicySet(policySet);
  const snapshot = snapshotPolicySet(policySet);
  return {
    check(request: AuthorizationRequest): AuthorizationResult {
      assertValidRequest(request);
      return evaluate(snapshot, request);
    },
  };
}
