#!/usr/bin/env node
/**
 * `agent-sudo` — a thin command-line wrapper over the Agent Sudo library.
 *
 * It does no policy matching of its own. It reads JSON, hands it to the exact
 * same public API the library exposes (`createSudo` for `validate`, `check` for
 * `check`), and prints the result. Validation and evaluation semantics —
 * declared rule order, first match wins, required explicit default, no implicit
 * allow — are therefore identical to the programmatic API by construction.
 *
 *   argv → JSON.parse → createSudo / check (validation + engine) → stdout
 *
 * Exit codes:
 *   0  validate: the policy is structurally valid
 *      check:    evaluation completed — the decision may be allow, deny or
 *                require_approval; a deny is a successful evaluation, not an error
 *   1  a file could not be read, JSON was malformed, or the policy / request
 *      was structurally invalid
 *   2  usage error (unknown command, wrong number of arguments)
 */

import { readFileSync } from "node:fs";
import process from "node:process";

import {
  check,
  createSudo,
  InvalidPolicySetError,
  InvalidRequestError,
} from "./index.ts";
import type { AuthorizationRequest, PolicySet } from "./index.ts";

/** Raised for argument/command mistakes; mapped to exit code 2. */
class UsageError extends Error {}

const HELP = `agent-sudo — evaluate AI-agent authorization policies

Usage:
  agent-sudo validate <policy.json>
  agent-sudo check <policy.json> <request.json>
  agent-sudo --help

Commands:
  validate   Structurally validate a JSON policy file (same checks as the
             library). Prints a one-line summary on success.
  check      Evaluate a JSON authorization request against a JSON policy and
             print the AuthorizationResult as JSON to stdout.

Exit codes:
  0   validate: policy is valid
      check:    evaluation completed (decision may be allow, deny or
                require_approval — a deny is not a CLI error)
  1   unreadable file, malformed JSON, or invalid policy / request
  2   usage error

Agent Sudo only returns a decision. It never executes the requested action.
`;

/** Read a file and parse it as JSON, with messages aimed at a CLI user. */
function readJsonFile(label: string, filePath: string): unknown {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      `cannot read ${label} file "${filePath}"${code ? ` (${code})` : ""}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `${label} file "${filePath}" is not valid JSON: ${(err as Error).message}`,
    );
  }
}

function runValidate(args: string[]): void {
  if (args.length !== 1) {
    throw new UsageError("validate expects one argument: <policy.json>");
  }
  const policyPath = args[0]!;
  const parsed = readJsonFile("policy", policyPath);

  // createSudo runs assertValidPolicySet — the same check the library performs.
  createSudo(parsed as PolicySet);

  const policy = parsed as PolicySet;
  process.stdout.write(
    `${policyPath}: valid — ${policy.rules.length} rule(s), default "${policy.defaultDecision}"\n`,
  );
}

function runCheck(args: string[]): void {
  if (args.length !== 2) {
    throw new UsageError(
      "check expects two arguments: <policy.json> <request.json>",
    );
  }
  const [policyPath, requestPath] = args as [string, string];
  const policy = readJsonFile("policy", policyPath);
  const request = readJsonFile("request", requestPath);

  // check runs assertValidPolicySet + assertValidRequest + the engine.
  const result = check(policy as PolicySet, request as AuthorizationRequest);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === undefined) {
    process.stderr.write(HELP);
    return 2;
  }

  try {
    switch (command) {
      case "validate":
        runValidate(rest);
        return 0;
      case "check":
        runCheck(rest);
        return 0;
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`agent-sudo: ${err.message}\n`);
      process.stderr.write(`Run "agent-sudo --help" for usage.\n`);
      return 2;
    }
    if (err instanceof InvalidPolicySetError) {
      process.stderr.write(`agent-sudo: invalid policy: ${err.message}\n`);
      return 1;
    }
    if (err instanceof InvalidRequestError) {
      process.stderr.write(`agent-sudo: invalid request: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(
      `agent-sudo: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

// Set the exit code rather than calling process.exit(): process.exit() can
// terminate the process before a large piped stdout write has drained,
// truncating the AuthorizationResult while still reporting success. Setting
// process.exitCode lets Node flush stdout and exit once the event loop empties.
process.exitCode = main(process.argv.slice(2));
