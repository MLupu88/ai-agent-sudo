/**
 * Integration-shape example: an MCP-style tool-call envelope.
 *
 * This is NOT an official or certified MCP adapter and pulls in no MCP SDK. It
 * models just enough of the `tools/call` shape to show how a second, materially
 * different runtime maps its attempted tool call into the SAME Agent Sudo
 * `AuthorizationRequest`:
 *
 *     MCP-style tools/call  ->  mcpToolCallToRequest()  ->  AuthorizationRequest
 *
 * Materially distinctive traits of this shape (contrast with `openai-style.ts`):
 *   - a JSON-RPC envelope with `method: "tools/call"`
 *   - the tool name lives at `params.name` (dotted / kebab-case convention)
 *   - `params.arguments` is an already-parsed structured object
 *   - argument keys are camelCase
 *   - identity is the connected MCP client, supplied by the session
 *
 * The mapper only translates data. It never receives or calls a tool, and it
 * has no knowledge of the policy.
 */

import type { AuthorizationRequest, Context } from "../../src/index.ts";
import { CANONICAL_ACTIONS } from "./canonical-actions.ts";

// --- the runtime-specific input shape ---------------------------------------

export interface McpCallToolParams {
  name: string;
  /** MCP delivers arguments as an already-parsed structured object. */
  arguments: Record<string, unknown>;
}

export interface McpCallToolRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: "tools/call";
  params: McpCallToolParams;
}

/** Facts the MCP envelope does not carry; the session knows them. */
export interface McpSessionContext {
  /** The connected MCP client identity. */
  clientId: string;
  /** Deployment environment the server is running in. */
  env: string;
}

// --- this example's own mapping table --------------------------------------

/** MCP tool name -> canonical action. Unlisted names pass through as-is. */
const MCP_TOOL_TO_ACTION: Record<string, string> = {
  "crm.get-customer": CANONICAL_ACTIONS.readCustomer,
  "crm.delete-contact": CANONICAL_ACTIONS.deleteCustomer,
  "mail.send": CANONICAL_ACTIONS.sendEmail,
};

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`mcp-style: expected string argument "${key}"`);
  }
  return value;
}

// --- the mapper: runtime tool call -> AuthorizationRequest -----------------

export function mcpToolCallToRequest(
  message: McpCallToolRequest,
  session: McpSessionContext,
): AuthorizationRequest {
  const args = message.params.arguments;
  const action = MCP_TOOL_TO_ACTION[message.params.name] ?? message.params.name;

  const context: Context = { env: session.env, runtime: "mcp-style" };
  const request: AuthorizationRequest = {
    actor: { id: session.clientId },
    action: { name: action },
    context,
  };

  if (
    action === CANONICAL_ACTIONS.readCustomer ||
    action === CANONICAL_ACTIONS.deleteCustomer
  ) {
    request.resource = { type: "customer", id: readString(args, "customerId") };
  } else if (action === CANONICAL_ACTIONS.sendEmail) {
    request.resource = { type: "email", id: readString(args, "messageId") };
    context.recipient_scope = readString(args, "recipientScope");
  }

  return request;
}
