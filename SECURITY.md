# Security policy

## Supported versions

Agent Sudo is at **v0.1.x**. Security fixes are applied to the latest released
`0.1.x` version. There are no other supported release lines yet.

| Version | Supported |
| --- | --- |
| `0.1.x` | ✅ latest patch |
| `< 0.1.0` | ❌ (pre-release) |

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues, pull requests, or
discussions.**

To report privately:

1. **Preferred:** if GitHub's private vulnerability reporting is enabled for this
   repository, open the repository's **Security** tab and use **"Report a
   vulnerability"**. This creates a private advisory visible only to you and the
   maintainers.
2. **If that option is not available:** open a regular GitHub issue that contains
   **only** a request for a private contact channel — for example, *"I have a
   security report for Agent Sudo; please open a private channel."* Do not include
   any details, reproduction steps, or affected-version information in that public
   issue. A maintainer will follow up to establish a private channel.

Please include, once a private channel exists:

- a description of the issue and its impact,
- the version or commit affected,
- a minimal reproduction (inputs and observed vs. expected behaviour),
- any known mitigations.

## What is in scope

Agent Sudo is a dependency-free, network-free, in-process authorization
**decision** library. In-scope reports include, for example:

- a structurally invalid `PolicySet` or `AuthorizationRequest` that is **not**
  rejected (a fail-open),
- `require_approval` being returned as `allow` (or any decision being silently
  changed),
- rule evaluation not following declared order / first-match semantics,
- `createSudo` failing to isolate a bound policy from later mutation of the
  caller's object,
- a crash (rather than a typed `InvalidPolicySetError` / `InvalidRequestError`)
  on adversarial but JSON-shaped input.

## What is out of scope

Consistent with [`docs/security.md`](./docs/security.md), the following are the
**host application's** responsibility, not Agent Sudo's:

- authenticating `actor.id` or any identity,
- the integrity or provenance of the `PolicySet`,
- the correctness of runtime mappers you write,
- enforcing the returned decision, sandboxing tool execution, or handling
  approvals,
- secrets management and process isolation.

## Disclosure

Once a fix is available, a patched `0.1.x` release will be published and, where
appropriate, a GitHub Security Advisory will be issued crediting the reporter
(unless anonymity is requested).
