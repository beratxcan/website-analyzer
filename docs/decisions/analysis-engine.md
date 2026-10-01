# Deterministic Analysis Engine Design

## Problem

The product must tell users something true and useful about a website. If the
output were produced by a language model directly, it would be unreproducible,
unauditable, expensive per run, and impossible to compare over time. The system
needs a foundation that is trustworthy on its own — a set of objective,
repeatable checks — so that interpretation can be layered on top without the
interpretation becoming the source of truth.

## Context

- The same website will be analyzed repeatedly; results must be comparable
  across runs.
- Findings must be explainable, with evidence a user can verify.
- The engine must be usable from the worker without dragging in a web framework
  or a database client.
- New rules will be added over the product's lifetime without disturbing
  existing ones.

## Alternatives Considered

1. **AI-only analysis.** Fast to build, but unreproducible, unauditable,
   costly, and non-deterministic across identical inputs — unacceptable as a
   foundation.
2. **Headless-browser measurement (Lighthouse-style).** Richer metrics, but
   heavyweight, nondeterministic run to run, and requires a rendering runtime in
   every environment including CI.
3. **A monolithic checker with global mutable state.** Simple initially, but
   hard to extend and impossible to test rule by rule.
4. **A deterministic, versioned, rule-based engine over a normalized document
   (chosen).**

## Chosen Solution

The engine (`@analyzer/analysis`) is framework- and persistence-independent and
is built from small, composable parts:

- **One parse, one document.** The fetched HTML is parsed once into a
  `NormalizedWebsiteDocument` that exposes everything an analyzer could need.
  Analyzers never re-parse HTML, which keeps cost linear and guarantees all
  analyzers see identical input.
- **Rules as pure functions.** A rule maps the normalized document to either
  `null` or a finding with a stable code, category, severity, description,
  score impact and evidence. Rules are grouped into analyzers by category; there
  are 56 rule codes today across SEO, technical, content, accessibility and
  performance.
- **A registry, not a switch.** Analyzers register in an `AnalyzerRegistry`;
  adding a rule set extends the pipeline without modifying existing analyzers.
- **Isolated execution.** Each analyzer runs in its own try/catch. One failing
  analyzer drops that analyzer's findings and marks the run
  `PARTIALLY_COMPLETED`; the rest are kept.
- **Deterministic scoring.** A category starts at 100 and subtracts declared
  point values, clamped to `[0, 100]`; the overall score is a weight-averaged
  category score. Weights and math are versioned.
- **Versioning for reproducibility.** The engine version, scoring version and
  per-analyzer versions are recorded with every run, so a stored result is
  always interpretable in the terms it was produced under.
- **Golden fixtures.** The test suite pins representative documents to exact
  expected findings and scores, so an intended change is deliberate and an
  accidental one is caught.

Findings are also sorted deterministically (severity, then code) so the same
document always yields the same ordering.

## Trade-offs

- A normalized document is a shared contract that grows as new analyzers need
  new signals; extending it is a deliberate, reviewable change.
- Static rule analysis cannot measure real rendering performance, so
  performance findings are structural (sizes, counts, hints, headers) rather than
  runtime Core Web Vitals.
- Severity and point values are hand-tuned and versioned; the version bump
  discipline is a manual process that must be respected.
- Partial completion means a score can be computed over fewer categories; this is
  an honest degradation but requires the UI and reports to surface the
  `PARTIALLY_COMPLETED` state.

## Future Evolution

- **Comparison** was built as pure functions over persisted runs, demonstrating
  that the deterministic model supports new features without schema change; the
  same seam supports reporting.
- New analyzers (for example structured-data or internationalization checks) join
  by registering a rule set.
- A rendering step for runtime metrics would be additive and would require a
  scoring-version bump, not a redesign.
- Deterministic fixtures plus version metadata make it safe to evolve rules over
  time while keeping historical results interpretable.

See [../architecture/analysis-pipeline.md](../architecture/analysis-pipeline.md)
for the end-to-end stages and [ai-orchestration.md](./ai-orchestration.md) for how
interpretation is layered on top.
