# AI Orchestration Design

## Problem

Raw technical findings are precise but not approachable: a non-technical user
wants to know what matters most, why, and what to do about it. A language model
is well suited to that interpretation, but it is not trustworthy as a detector —
it can hallucinate problems, invent evidence, and produce output that varies
between calls. The system needs AI's explanatory strength without letting it
pollute the authoritative analysis.

## Context

- Deterministic findings already exist and are persisted before AI is
  considered.
- Model providers differ in API shape and reliability; the application should not
  be tied to one vendor.
- Website content is untrusted and may contain text crafted to manipulate the
  model (prompt injection).
- AI calls are slow, can fail, and cost money, so they must be isolated and
  observable.

## Alternatives Considered

1. **Let the model analyze raw HTML.** Maximizes model freedom, but makes output
   unreproducible, exposes the application to prompt injection from page
   content, and produces findings that cannot be verified against anything.
2. **Call a specific provider SDK directly from the application.** Fast to
   integrate, but couples the domain to one vendor and leaks SDK types across
   boundaries.
3. **Trust model output as-is.** Accepts hallucinated findings and fabricated
   evidence — unacceptable when the deterministic result is the source of truth.
4. **A provider-independent orchestration layer that interprets deterministic
   findings under strict validation (chosen).**

## Chosen Solution

AI is a **recommendation enrichment layer** that runs strictly after
deterministic completion, on its own queue, over the persisted result:

- **Deterministic first.** The run is committed as `COMPLETED` before an
  `ai.enrich` job is enqueued. AI reads only persisted findings, scores and
  metadata — never raw HTML.
- **Provider abstraction.** The application depends on a single `AIProvider`
  interface. The implemented adapter speaks an OpenAI-compatible HTTP API with no
  vendor SDK, so the endpoint and model are configuration, not code. Provider
  types and exceptions never cross the boundary.
- **Bounded, deterministic context.** A context builder selects findings
  (severity, then score impact, then rule code) up to a hard cap and compacts
  their evidence. Internal identifiers, user data and raw HTML never enter the
  context, and the same result always produces the same context.
- **Validation chain.** Output must pass schema validation, then domain
  validation (every recommendation must cite finding codes that exist, with a
  matching category; duplicates and over-referencing are rejected), which
  together enforce grounding in real findings.
- **Bounded repair.** Invalid output triggers at most one repair attempt with the
  validation issues fed back; a second failure is final.
- **Failure isolation.** AI runs on its own queue with its own retry policy.
  Retryable provider errors retry with backoff; configuration and validation
  errors fail fast. An AI failure marks only the AI result failed — the
  deterministic run is untouched, and reports fall back to a deterministic
  summary.
- **Untrusted input posture.** Website-derived text is data, never instructions,
  and the system prompt forbids acting on embedded directives.
- **Usage observability.** Provider, model, prompt/schema versions, token counts,
  latency and an estimated cost are recorded per result, without storing any
  prompt content.

## Trade-offs

- A separate package, queue and lifecycle to build and operate.
- Grounding constraints reduce the model's freedom, so recommendations are
  tightly scoped to observed findings rather than open-ended advice.
- An AI result can legitimately be missing or failed while the analysis is
  complete, so the UI and reports must always handle the no-AI path.
- Cost and latency are external and variable; the design bounds them with
  contexts caps, output caps, timeouts and retry limits rather than eliminating
  them.

## Future Evolution

- New AI tasks (per-finding explanations, remediation plans) reuse the same
  validation and grounding chain.
- Multi-provider routing would compose provider adapters without changing the
  orchestrator's contract.
- Cost controls could cap enrichment frequency using the usage data already
  captured.
- A richer grounding model (for example, requiring evidence quotes) would
  strengthen validation without altering the architecture.

See [../architecture/ai-enrichment-flow.md](../architecture/ai-enrichment-flow.md)
for the flow and [analysis-engine.md](./analysis-engine.md) for the layer this
builds upon.
