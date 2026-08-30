import type { AuthorizationRequest, MatchPrimitive, RuleMatch } from "./types.ts";

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function stringCriterionMatches(
  criterion: string | string[] | undefined,
  actual: string | undefined,
): boolean {
  if (criterion === undefined) return true; // wildcard
  if (actual === undefined) return false; // required by the rule, absent on the request
  return asArray(criterion).includes(actual);
}

/**
 * Deterministic match model.
 *
 * Returns `true` only when every criterion present on `match` is satisfied by
 * `request`. Absent criteria are wildcards, so `{}` matches everything. There is
 * no scoring and no ordering effect here — precedence lives in the engine.
 */
export function ruleMatches(
  match: RuleMatch,
  request: AuthorizationRequest,
): boolean {
  if (!stringCriterionMatches(match.actorId, request.actor.id)) return false;
  if (!stringCriterionMatches(match.action, request.action.name)) return false;
  if (!stringCriterionMatches(match.resourceType, request.resource?.type)) {
    return false;
  }
  if (!stringCriterionMatches(match.resourceId, request.resource?.id)) {
    return false;
  }

  if (match.context !== undefined) {
    const context = request.context;
    for (const [key, expected] of Object.entries(match.context)) {
      if (context === undefined || !Object.hasOwn(context, key)) return false;
      const actual = context[key];
      const allowed: MatchPrimitive[] = Array.isArray(expected)
        ? expected
        : [expected];
      if (!allowed.some((candidate) => candidate === actual)) return false;
    }
  }

  return true;
}
