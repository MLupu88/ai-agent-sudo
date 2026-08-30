/**
 * AI Agent Sudo — a tiny, provider-neutral authorization layer for AI agents.
 *
 * It sits immediately before a tool or action runs and answers one question:
 * "May this agent perform this action, on this resource, in this context?"
 * It returns `allow` | `deny` | `require_approval`. It never executes anything.
 *
 * This module is the integration contract. Implementation helpers
 * (`ruleMatches`, the `assertValid*` functions) are intentionally not exported.
 */

export { check, createSudo } from "./engine.ts";
export type { Sudo } from "./engine.ts";
export { InvalidPolicySetError, InvalidRequestError } from "./errors.ts";

export type {
  Action,
  Actor,
  AuthorizationRequest,
  AuthorizationResult,
  Context,
  Decision,
  JsonPrimitive,
  JsonValue,
  MatchPrimitive,
  PolicySet,
  Resource,
  Rule,
  RuleMatch,
} from "./types.ts";
