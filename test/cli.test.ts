import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { check } from "../src/index.ts";
import type { PolicySet } from "../src/index.ts";

// fileURLToPath (not URL#pathname) so a checkout path containing a space, %, or #
// is decoded correctly before it is handed to spawn.
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const POLICY = "examples/policy-files/crm-policy.json";
const REQ = (name: string) => `examples/policy-files/requests/${name}.json`;

const scratch = mkdtempSync(join(tmpdir(), "agent-sudo-cli-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Write a fixture into the scratch dir and return its path. */
function fixture(name: string, contents: string): string {
  const path = join(scratch, name);
  writeFileSync(path, contents);
  return path;
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// 1. valid policy -> validate exits 0
test("validate: valid policy exits 0", () => {
  const { status, stdout } = run("validate", POLICY);
  assert.equal(status, 0);
  assert.match(stdout, /valid/);
});

// 2. malformed JSON policy -> non-zero
test("validate: malformed JSON exits non-zero", () => {
  const bad = fixture("bad.json", '{ "rules": [ }');
  const { status, stderr } = run("validate", bad);
  assert.notEqual(status, 0);
  assert.match(stderr, /not valid JSON/);
});

// 3. structurally invalid policy -> non-zero
test("validate: structurally invalid policy exits non-zero", () => {
  const invalid = fixture(
    "invalid.json",
    JSON.stringify({ rules: [], defaultReason: "x" }),
  );
  const { status, stderr } = run("validate", invalid);
  assert.equal(status, 1);
  assert.match(stderr, /invalid policy/);
});

test("validate: duplicate rule ids exit non-zero", () => {
  const dup = fixture(
    "dup.json",
    JSON.stringify({
      rules: [
        { id: "r", match: {}, decision: "allow", reason: "a" },
        { id: "r", match: {}, decision: "deny", reason: "b" },
      ],
      defaultDecision: "deny",
      defaultReason: "d",
    }),
  );
  const { status, stderr } = run("validate", dup);
  assert.equal(status, 1);
  assert.match(stderr, /duplicate rule id/);
});

// 4. allow -> check exits 0 + correct JSON
test("check: allow result exits 0 with correct JSON", () => {
  const { status, stdout } = run("check", POLICY, REQ("read-customer"));
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), {
    decision: "allow",
    reason: "CRM reads are permitted.",
    ruleId: "allow-crm-read",
    source: "rule",
  });
});

// 5. deny -> check STILL exits 0
test("check: deny result still exits 0", () => {
  const { status, stdout } = run("check", POLICY, REQ("delete-customer"));
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), {
    decision: "deny",
    reason: "Customer deletion is not permitted.",
    ruleId: "deny-customer-deletion",
    source: "rule",
  });
});

// 6. require_approval -> exits 0
test("check: require_approval result exits 0", () => {
  const { status, stdout } = run(
    "check",
    POLICY,
    REQ("external-email-production"),
  );
  assert.equal(status, 0);
  assert.equal(JSON.parse(stdout).decision, "require_approval");
  assert.equal(JSON.parse(stdout).ruleId, "approve-prod-external-email");
});

// 7. unknown action -> exits 0 + explicit default deny
test("check: unknown action exits 0 with explicit default deny", () => {
  const { status, stdout } = run("check", POLICY, REQ("unknown-action"));
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), {
    decision: "deny",
    reason: "No policy rule authorized this action.",
    ruleId: null,
    source: "default",
  });
});

// 8. malformed request -> non-zero
test("check: malformed request exits non-zero", () => {
  const badReq = fixture(
    "badreq.json",
    JSON.stringify({ actor: {}, action: { name: "read_customer" } }),
  );
  const { status, stderr } = run("check", POLICY, badReq);
  assert.equal(status, 1);
  assert.match(stderr, /invalid request/);
});

// 9. nonexistent / unreadable file -> non-zero
test("check: nonexistent file exits non-zero", () => {
  const { status, stderr } = run("check", join(scratch, "nope.json"), REQ("read-customer"));
  assert.equal(status, 1);
  assert.match(stderr, /cannot read policy file/);
});

// 10. CLI uses the same first-match / declared-order semantics as the library
test("check: first-match order matches the library exactly", () => {
  const ordered: PolicySet = {
    rules: [
      { id: "first-allow", match: { action: "deploy" }, decision: "allow", reason: "first wins" },
      { id: "second-deny", match: { action: "deploy" }, decision: "deny", reason: "never reached" },
    ],
    defaultDecision: "deny",
    defaultReason: "default",
  };
  const request = { actor: { id: "a" }, action: { name: "deploy" } };

  const policyPath = fixture("ordered.json", JSON.stringify(ordered));
  const requestPath = fixture("deploy.json", JSON.stringify(request));

  const { status, stdout } = run("check", policyPath, requestPath);
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), check(ordered, request));
  assert.equal(JSON.parse(stdout).ruleId, "first-allow");
});

// 11. --help behaves sensibly
test("--help prints usage to stdout and exits 0", () => {
  const { status, stdout, stderr } = run("--help");
  assert.equal(status, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /agent-sudo validate <policy\.json>/);
  assert.match(stdout, /agent-sudo check <policy\.json> <request\.json>/);
  assert.equal(stderr, "");
});

test("no command prints usage to stderr and exits 2", () => {
  const { status, stdout, stderr } = run();
  assert.equal(status, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /Usage:/);
});

test("unknown command exits 2", () => {
  const { status, stderr } = run("frobnicate");
  assert.equal(status, 2);
  assert.match(stderr, /unknown command/);
});

// 12. A `check` result larger than the OS pipe buffer (~64 KiB) must survive
// intact when stdout is a real shell pipe. Regression: the CLI used to call
// process.exit(), which could terminate before a large stdout write had
// drained — emitting a truncated, unparseable AuthorizationResult while still
// reporting exit 0.
const PIPE_REPRO =
  process.platform !== "win32" &&
  spawnSync("bash", ["-c", "true"]).status === 0;

test(
  "check: a >64 KiB result is not truncated when stdout is a shell pipe",
  { skip: PIPE_REPRO ? false : "needs bash and a POSIX pipe" },
  () => {
    const bigReason = "R".repeat(96 * 1024); // ~96 KiB, well past the pipe buffer
    const policy: PolicySet = {
      rules: [
        { id: "big", match: { action: "go" }, decision: "deny", reason: bigReason },
      ],
      defaultDecision: "deny",
      defaultReason: "unused",
    };
    const request = { actor: { id: "a" }, action: { name: "go" } };
    const policyPath = fixture("big-policy.json", JSON.stringify(policy));
    const requestPath = fixture("big-request.json", JSON.stringify(request));

    // Run the real CLI with stdout going through an actual shell pipe (`| cat`),
    // not a Node-managed capture — the truncation only shows through an OS pipe
    // whose reader is not the Node parent. `pipefail` surfaces the CLI's own
    // exit status as the pipeline status.
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const piped = spawnSync(
      "bash",
      [
        "-c",
        `set -o pipefail; ${q(process.execPath)} ${q(CLI)} check ${q(policyPath)} ${q(requestPath)} | cat`,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );

    assert.equal(piped.status, 0, piped.stderr);
    assert.ok(
      Buffer.byteLength(piped.stdout, "utf8") > 65536,
      `stdout was ${Buffer.byteLength(piped.stdout, "utf8")} bytes — truncated at the pipe buffer`,
    );

    const result = JSON.parse(piped.stdout) as {
      decision: string;
      reason: string;
      ruleId: string | null;
      source: string;
    };
    assert.equal(result.decision, "deny");
    assert.equal(result.ruleId, "big");
    assert.equal(result.source, "rule");
    assert.equal(result.reason, bigReason); // the entire reason round-tripped
    assert.deepEqual(JSON.parse(piped.stdout), check(policy, request));
  },
);
