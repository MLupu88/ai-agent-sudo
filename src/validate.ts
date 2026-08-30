import { InvalidPolicySetError, InvalidRequestError } from "./errors.ts";
import type { AuthorizationRequest, Decision, PolicySet } from "./types.ts";

const DECISIONS = ["allow", "deny", "require_approval"] as const;

const STRING_MATCH_FIELDS = [
  "actorId",
  "action",
  "resourceType",
  "resourceId",
] as const;

const MATCH_FIELDS = [...STRING_MATCH_FIELDS, "context"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * True when `value` is representable in the {@link JsonValue} model: a finite
 * number, string, boolean, `null`, an array of such, or a plain object of such.
 * Rejects `undefined`, functions, symbols, bigint, `NaN`/`Infinity`, and
 * class instances (Date, Map, ...).
 */
function isJsonValue(value: unknown): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      if (Array.isArray(value)) return value.every(isJsonValue);
      if (!isPlainObject(value)) return false;
      return Object.values(value).every(isJsonValue);
    default:
      return false;
  }
}

function isDecision(value: unknown): value is Decision {
  return (
    typeof value === "string" &&
    (DECISIONS as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMatchPrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isStringOrStringArray(value: unknown): boolean {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((v) => typeof v === "string"))
  );
}

/**
 * Assert that `input` is a structurally valid {@link PolicySet}.
 *
 * Rejects (never fails open) on: non-object input, missing/invalid
 * `defaultDecision` or `defaultReason`, non-array `rules`, and any malformed
 * rule (bad/empty/duplicate `id`, invalid `decision`, empty `reason`, non-object
 * `match`, unknown `match` keys, or wrong `match` value types).
 */
export function assertValidPolicySet(
  input: unknown,
): asserts input is PolicySet {
  if (!isPlainObject(input)) {
    throw new InvalidPolicySetError("policy set must be an object");
  }

  if (!isDecision(input["defaultDecision"])) {
    throw new InvalidPolicySetError(
      `policy set "defaultDecision" is required and must be one of: ${DECISIONS.join(", ")}`,
    );
  }

  if (!isNonEmptyString(input["defaultReason"])) {
    throw new InvalidPolicySetError(
      'policy set "defaultReason" is required and must be a non-empty string',
    );
  }

  if (!Array.isArray(input["rules"])) {
    throw new InvalidPolicySetError('policy set "rules" must be an array');
  }

  const seenIds = new Set<string>();
  input["rules"].forEach((rule, index) => {
    assertValidRule(rule, index, seenIds);
  });
}

function assertValidRule(
  rule: unknown,
  index: number,
  seenIds: Set<string>,
): void {
  const at = `rules[${index}]`;

  if (!isPlainObject(rule)) {
    throw new InvalidPolicySetError(`${at} must be an object`);
  }

  if (!isNonEmptyString(rule["id"])) {
    throw new InvalidPolicySetError(`${at}.id must be a non-empty string`);
  }
  if (seenIds.has(rule["id"])) {
    throw new InvalidPolicySetError(`duplicate rule id: ${rule["id"]}`);
  }
  seenIds.add(rule["id"]);

  if (!isDecision(rule["decision"])) {
    throw new InvalidPolicySetError(
      `${at}.decision must be one of: ${DECISIONS.join(", ")}`,
    );
  }

  if (!isNonEmptyString(rule["reason"])) {
    throw new InvalidPolicySetError(`${at}.reason must be a non-empty string`);
  }

  const match = rule["match"];
  if (!isPlainObject(match)) {
    throw new InvalidPolicySetError(`${at}.match must be an object`);
  }

  for (const key of Object.keys(match)) {
    if (!(MATCH_FIELDS as readonly string[]).includes(key)) {
      throw new InvalidPolicySetError(
        `${at}.match has unknown key "${key}" (allowed: ${MATCH_FIELDS.join(", ")})`,
      );
    }
  }

  for (const field of STRING_MATCH_FIELDS) {
    if (field in match && !isStringOrStringArray(match[field])) {
      throw new InvalidPolicySetError(
        `${at}.match.${field} must be a string or string[]`,
      );
    }
  }

  if ("context" in match) {
    const context = match["context"];
    if (!isPlainObject(context)) {
      throw new InvalidPolicySetError(`${at}.match.context must be an object`);
    }
    for (const [key, expected] of Object.entries(context)) {
      const ok = Array.isArray(expected)
        ? expected.every(isMatchPrimitive)
        : isMatchPrimitive(expected);
      if (!ok) {
        throw new InvalidPolicySetError(
          `${at}.match.context["${key}"] must be a primitive (string | number | boolean | null) or an array of primitives`,
        );
      }
    }
  }
}

/**
 * Assert that `request` is a structurally valid {@link AuthorizationRequest}.
 *
 * Unknown extra properties are allowed (different runtimes carry different
 * baggage), but every field Agent Sudo understands must be well-formed when
 * present. A malformed known field throws `InvalidRequestError` — it never
 * silently causes a restrictive rule to miss and fall through to the default.
 */
export function assertValidRequest(
  request: unknown,
): asserts request is AuthorizationRequest {
  if (!isPlainObject(request)) {
    throw new InvalidRequestError("request must be an object");
  }

  const actor = request["actor"];
  if (!isPlainObject(actor)) {
    throw new InvalidRequestError("request.actor must be an object");
  }
  if (!isNonEmptyString(actor["id"])) {
    throw new InvalidRequestError("request.actor.id must be a non-empty string");
  }

  const action = request["action"];
  if (!isPlainObject(action)) {
    throw new InvalidRequestError("request.action must be an object");
  }
  if (!isNonEmptyString(action["name"])) {
    throw new InvalidRequestError(
      "request.action.name must be a non-empty string",
    );
  }

  const resource = request["resource"];
  if (resource !== undefined) {
    if (!isPlainObject(resource)) {
      throw new InvalidRequestError("request.resource must be an object");
    }
    if (resource["type"] !== undefined && typeof resource["type"] !== "string") {
      throw new InvalidRequestError("request.resource.type must be a string");
    }
    if (resource["id"] !== undefined && typeof resource["id"] !== "string") {
      throw new InvalidRequestError("request.resource.id must be a string");
    }
  }

  const context = request["context"];
  if (context !== undefined) {
    if (!isPlainObject(context)) {
      throw new InvalidRequestError("request.context must be a plain object");
    }
    if (!isJsonValue(context)) {
      throw new InvalidRequestError(
        "request.context must be a JSON-compatible object (string | number | boolean | null | array | object values only)",
      );
    }
  }
}
