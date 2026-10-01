# Design Decisions

This section records the architectural decisions that shape the system: what
problem triggered each decision, what alternatives were weighed, what was
chosen, and what the choice costs. The intent is that a future contributor (or
the original author, months later) can understand *why* the code looks the way
it does before deciding to change it.

## Format

Each record follows the same structure:

- **Problem** — the situation that demanded a decision.
- **Context** — constraints, requirements and forces at play.
- **Alternatives Considered** — the realistic options, with their merits and
  drawbacks.
- **Chosen Solution** — what the system does today.
- **Trade-offs** — what the choice costs, stated honestly.
- **Future Evolution** — when and how the decision could reasonably change.

## Records

| Record | Decision |
| --- | --- |
| [auth-design.md](./auth-design.md) | Cookie-based authentication with short-lived access tokens and rotating refresh tokens, and ownership isolation for every resource. |
| [queue-design.md](./queue-design.md) | Asynchronous analysis on BullMQ with a dedicated worker process instead of in-request processing. |
| [ssrf-protection.md](./ssrf-protection.md) | Defense-in-depth SSRF protection for the outbound website fetcher. |
| [analysis-engine.md](./analysis-engine.md) | A deterministic, versioned, framework-independent rule engine as the source of truth. |
| [ai-orchestration.md](./ai-orchestration.md) | A provider-independent AI layer that explains and enriches deterministic findings under strict validation. |

## Related reading

- [../architecture/](../architecture/) — how these decisions fit together at
  runtime.
- [../deployment/](../deployment/) — operational consequences.
