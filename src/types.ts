/**
 * Core conceptual model for Agent Sudo.
 *
 * Everything here is deliberately small and JSON-friendly so that a request or a
 * policy set could later cross a process / API boundary without redesign.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The three — and only three — authorization outcomes. */
export type Decision = "allow" | "deny" | "require_approval";

/** Whoever is attempting the action. Must at minimum be identifiable. */
export interface Actor {
  id: string;
}

/** What is being attempted. Must at minimum have a stable name. */
export interface Action {
  name: string;
}

/** Optional target of the action. Generic on purpose. */
export interface Resource {
  type?: string;
  id?: string;
}

/** Optional ambient facts about the attempt (env, tenant, args, ...). */
export type Context = Record<string, JsonValue>;

/** A single attempted action handed to Agent Sudo for a decision. */
export interface AuthorizationRequest {
  actor: Actor;
  action: Action;
  resource?: Resource;
  context?: Context;
}

/**
 * The result of evaluating a request. Always explainable.
 *
 * - `source: "rule"`   -> a rule matched; `ruleId` is that rule's id.
 * - `source: "default"` -> no rule matched; `ruleId` is `null`.
 */
export interface AuthorizationResult {
  decision: Decision;
  reason: string;
  ruleId: string | null;
  source: "rule" | "default";
}

/** Values usable in `RuleMatch.context`. Primitive equality / set membership only. */
export type MatchPrimitive = string | number | boolean | null;

/**
 * Match criteria for a rule.
 *
 * Every field that is present must match (logical AND). Absent fields are
 * wildcards. A string field may be a single value or an array meaning "any of".
 * `{}` matches every request.
 */
export interface RuleMatch {
  actorId?: string | string[];
  action?: string | string[];
  resourceType?: string | string[];
  resourceId?: string | string[];
  /** Each key must exist in the request context with an equal primitive value (or one of the listed values). */
  context?: Record<string, MatchPrimitive | MatchPrimitive[]>;
}

/** A single deterministic rule. */
export interface Rule {
  id: string;
  match: RuleMatch;
  decision: Decision;
  reason: string;
}

/**
 * An ordered set of rules plus an explicit default.
 *
 * There is no implicit allow: `defaultDecision` and `defaultReason` are
 * required, and a structurally invalid policy set is rejected rather than
 * treated as permissive.
 */
export interface PolicySet {
  rules: Rule[];
  defaultDecision: Decision;
  defaultReason: string;
}
