# Asynchronous Processing Design

## Problem

Analyzing a website means fetching an external URL, parsing its HTML and running
many rules — work whose duration is controlled by a third party and can take
seconds or fail transiently. AI enrichment adds another slow external call. If
any of this happened inside an HTTP request, the API would tie up request slots,
time out unpredictably, and have no path to retry, cancel or observe progress.
The system needs a way to accept work quickly and execute it durably.

## Context

- Redis is already present for rate limiting, so an in-memory queue would be a
  regression in durability and multi-instance behavior.
- The analysis engine and the AI layer are framework-independent packages, so the
  execution host should not couple them to a web framework.
- Jobs must be idempotent because delivery guarantees are at-least-once.
- The deployment target is a single host running a modular monolith plus a
  worker; distributed consensus machinery would be over-engineering.

## Alternatives Considered

1. **Synchronous analysis in the request.** Simplest to write, but unbounded
   latency, no retries, no cancellation, no progress, and a request slot spent
   for the duration of an external fetch.
2. **In-process background tasks (`setTimeout`/worker threads).** Cheap, but no
   durability across restarts, no distribution, and no visibility into queued
   work.
3. **A database-backed queue (advisory locks on a jobs table).** Durable and
   dependency-free, but reimplements scheduling, backoff, delayed jobs and
   concurrency that a queue library provides, and adds load to the primary
   database.
4. **BullMQ on Redis with a dedicated worker process (chosen).**

## Chosen Solution

Analysis is asynchronous end to end:

- The API creates the `Analysis` and its `AnalysisRun` in a transaction,
  enqueues a BullMQ job carrying **only** `analysisId` and `runId`, and returns.
- A **separate worker process** consumes the job. It is a NestJS application
  context (not an HTTP server) so it can share the same framework-independent
  domain packages while scaling independently and crashing in isolation.
- The worker runs the deterministic engine, persists findings and scores in a
  transaction, and then enqueues a second job on a separate `ai` queue.
- PostgreSQL is the single source of truth; the queue carries work, never state.
  Every job re-reads its inputs from the database and re-checks status before
  committing.

Reliability properties follow from this shape: deterministic job ids prevent
duplicate enqueues, uniqueness constraints and `skipDuplicates` prevent duplicate
rows, status claims make concurrent deliveries safe, transient errors retry with
exponential backoff while permanent errors are marked unrecoverable, and stale
runs are recovered after a threshold. The two queues are also a failure
boundary — an AI failure never affects the deterministic run.

The worker asserts Redis and PostgreSQL connectivity before consuming and closes
its queues and workers on `SIGTERM`, so it fails fast when misconfigured and
shuts down gracefully under orchestration.

## Trade-offs

- A second process to run and deploy; `pnpm dev` and the production compose file
  both account for it.
- Eventual consistency for the user: results are polled, not returned inline, so
  the UI must model intermediate states.
- Redis becomes a runtime dependency for accepting new work. It is not a source
  of truth, so losing it never corrupts data — it only delays new runs.
- Stale recovery uses a simple startup-and-interval sweep without distributed
  locking, which assumes a single worker. Scaling workers horizontally would
  require revisiting this.

## Future Evolution

- Horizontal worker scaling would add lock-aware recovery and per-worker
  concurrency tuning; the job contract would not change.
- Scheduled analyses would add a scheduler producer feeding the same queue.
- A dead-letter review surface could be built from the failures already recorded
  on runs and AI results.

See [../architecture/queue-architecture.md](../architecture/queue-architecture.md)
for the full execution semantics and sequence diagrams.
