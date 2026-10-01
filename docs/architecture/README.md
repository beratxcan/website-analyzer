# Architecture

This section describes how the AI SaaS Website Analyzer is built: the moving
parts, how a request travels through them, and the invariants each layer must
uphold. It is written for engineers joining the codebase — read it top to
bottom for the full picture, or jump to the document closest to your task.

## Documents

| Document | Covers |
| --- | --- |
| [system-overview.md](./system-overview.md) | Every runtime component, the request flow, and the end-to-end processing flow with a component diagram. |
| [analysis-pipeline.md](./analysis-pipeline.md) | The deterministic path from URL submission to persisted scores, step by step, and the scoring philosophy. |
| [queue-architecture.md](./queue-architecture.md) | The two BullMQ queues, retry and idempotency semantics, and stale-run recovery, with sequence diagrams. |
| [ai-enrichment-flow.md](./ai-enrichment-flow.md) | How AI enrichment runs *after* deterministic analysis, how its output is validated and grounded, and how it is isolated from failures. |
| [database-design.md](./database-design.md) | Entities, relationships, the ownership model, and the analysis lifecycle, with an entity-relationship diagram. |

## Architecture in one paragraph

The system is a **modular monolith plus dedicated worker processes**. A Next.js
dashboard talks to a NestJS REST API over credentialed HTTP; the API owns
authentication, resource ownership and persistence through PostgreSQL. Any work
that is slow, external or retryable — fetching and analyzing a website, calling
an AI provider — is never performed inside an HTTP request. The API writes an
analysis request to PostgreSQL, enqueues a BullMQ job that carries only
identifier references, and returns immediately. A separate worker process
consumes the job, runs the framework-independent analysis engine, persists
deterministic findings and scores, and then enqueues a second job for AI
enrichment. PostgreSQL is the single source of truth; Redis carries work, never
state.

## Cross-cutting principles

These rules hold across every document in this section:

- **Deterministic first, AI second.** The rule-based analysis engine produces
  the authoritative results. AI only explains, prioritizes and enriches them —
  it can never compute or change a score, run a rule, or fabricate a finding.
- **The database is the source of truth.** Queue jobs carry identity only;
  workers re-read state from PostgreSQL and re-check it inside transactions
  before committing.
- **Ownership is enforced server-side.** Every project, website, analysis, run,
  finding and report is scoped to the authenticated user, and foreign
  identifiers resolve to `404`, never `403`.
- **Untrusted input stays untrusted.** Target URLs pass through SSRF
  validation, and website-derived text reaches neither the database's trusted
  columns nor the model without sanitization and grounding.
- **Explicit failure semantics.** Retryable and permanent failures are
  distinguished deliberately, and dependency outages degrade one capability
  rather than the whole system.

## Related reading

- [../decisions/](../decisions/) — the reasoning behind individual choices.
- [../deployment/](../deployment/) — how to run the system locally and in
  production.
