# Agent Sudo documentation

Start with the [top-level README](../README.md) for positioning, install, and a
60-second quick start. These documents go deeper:

| Document | Read it for |
| --- | --- |
| [architecture.md](./architecture.md) | The responsibilities and boundaries; overall, cross-runtime, and internal decision-flow diagrams; the CLI as another caller |
| [authorization-model.md](./authorization-model.md) | The precise request / result / policy / match semantics, precedence, and malformed-input behaviour |
| [security.md](./security.md) | The honest trust model — what Agent Sudo does and does not protect against, plus a trust-boundary diagram |
| [integration-contract.md](./integration-contract.md) | Who owns the canonical vocabulary; how to write mapper conformance tests |
| [integrations.md](./integrations.md) | The mapper pattern; OpenAI-style / MCP-style / custom-runtime examples |
| [testing.md](./testing.md) | Test taxonomy, conformance testing, clean-consumer verification, TypeScript compatibility, CI |

Repository-level files: [`SECURITY.md`](../SECURITY.md),
[`CONTRIBUTING.md`](../CONTRIBUTING.md), [`CHANGELOG.md`](../CHANGELOG.md),
[`LICENSE`](../LICENSE).
