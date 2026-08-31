/**
 * Integration-shape example: an OpenAI-style function/tool-call envelope.
 *
 * This is NOT an official or certified OpenAI adapter and pulls in no OpenAI
 * SDK. It models just enough of the shape to show how a runtime maps its own
 * attempted tool call into an Agent Sudo `AuthorizationRequest`:
 *
 *     OpenAI-style tool call  ->  openAiToolCallToRequest()  ->  AuthorizationRequest
 *
 * Materially distinctive traits of this shape (contrast with `mcp-style.ts`):
 *   - the tool name lives at `function.name`
 *   - `function.arguments` is a JSON-encoded STRING that must be parsed
 *   - argument keys are flat snake_case
 *   - the envelope carries no caller identity; the runtime supplies it
 *
 * The mapper only translates data. It never receives or calls a tool, and it
 * has no knowledge of the policy.
 */

import type { AuthorizationRequest, Context } from "../../src/index.ts";
import { CANONICAL_ACTIONS } from "./canonical-actions.ts";

// --- the runtime-specific input shape ---------------------------------------

export interface OpenAiFunctionCall {
  name: string;
  /** OpenAI delivers tool-call arguments as a JSON-encoded string, not an object. */
  arguments: string;
}

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: OpenAiFunctionCall;
}

/** Facts the OpenAI envelope does not carry; the runtime knows them. */
export interface OpenAiRuntimeContext {
  /** Which assistant/agent identity is acting. */
  agentId: string;
  /** Deployment environment the runtime is executing in. */
  env: string;
}

// --- this example's own mapping table --------------------------------------

/** OpenAI function name -> canonical action. Unlisted names pass through as-is. */
const OPENAI_TOOL_TO_ACTION: Record<string, string> = {
  crm_lookup_customer: CANONICAL_ACTIONS.readCustomer,
  crm_delete_customer: CANONICAL_ACTIONS.deleteCustomer,
  email_send: CANONICAL_ACTIONS.sendEmail,
};

function parseArguments(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("openai-style: function.arguments is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("openai-style: function.arguments must decode to an object");
  }
  return parsed as Record<string, unknown>;
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`openai-style: expected string argument "${key}"`);
  }
  return value;
}

// --- the mapper: runtime tool call -> AuthorizationRequest -----------------

export function openAiToolCallToRequest(
  call: OpenAiToolCall,
  runtime: OpenAiRuntimeContext,
): AuthorizationRequest {
  const args = parseArguments(call.function.arguments);
  const action = OPENAI_TOOL_TO_ACTION[call.function.name] ?? call.function.name;

  const context: Context = { env: runtime.env, runtime: "openai-style" };
  const request: AuthorizationRequest = {
    actor: { id: runtime.agentId },
    action: { name: action },
    context,
  };

  if (
    action === CANONICAL_ACTIONS.readCustomer ||
    action === CANONICAL_ACTIONS.deleteCustomer
  ) {
    request.resource = { type: "customer", id: readString(args, "customer_id") };
  } else if (action === CANONICAL_ACTIONS.sendEmail) {
    request.resource = { type: "email", id: readString(args, "draft_id") };
    context.recipient_scope = readString(args, "recipient_type");
  }

  return request;
}
