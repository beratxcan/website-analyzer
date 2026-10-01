# Analysis Pipeline

## Purpose

Describe the deterministic path that turns a submitted URL into persisted,
reproducible findings and scores, and state the scoring philosophy that makes
those numbers trustworthy.

## Scope

The deterministic engine (`@analyzer/analysis`) and how the worker drives it.
AI enrichment is intentionally out of scope here and covered in
[ai-enrichment-flow.md](./ai-enrichment-flow.md).

## The principle

> The system first produces observable fact. AI later interprets that fact.

Every number a user sees — category scores, the overall score, severity levels
— is produced by deterministic rules over a normalized document. Given the same
input document and the same engine version, the output is always identical.
This is what makes analyses comparable across time and what allows AI to be
layered on top without becoming the source of truth.

## Stages

### 1. URL submission

The client posts a target URL to `POST /api/v1/analyses`. The API validates the
request DTO, resolves the owning website, and creates an `Analysis` plus its
first `AnalysisRun` in a single transaction. Nothing is fetched yet.

### 2. Validation

Input is validated in two layers: request-shape validation at the API boundary
(global `ValidationPipe`, unknown properties rejected) and URL validation in the
engine (`@analyzer/shared` URL normalization plus the SSRF rules below). Invalid
input never reaches the network.

### 3. SSRF checks

Before any connection is opened, the engine verifies that the target is safe to
fetch:

- only `http://` and `https://` schemes are accepted;
- embedded URL credentials (`user:password@host`) are rejected;
- the hostname is checked against a blocklist of internal and metadata names;
- every address the hostname resolves to is validated against loopback,
  private, link-local, CGNAT, reserved, multicast, documentation, NAT64 and
  IPv4-mapped ranges (IPv6 is expanded to hextets first, so hex-form
  IPv4-mapped addresses cannot slip through);
- if a hostname resolves to a mix of public and blocked addresses, the request
  is rejected;
- every redirect hop is re-validated, so a redirect cannot bypass the checks.

The full threat model and defense rationale live in
[../decisions/ssrf-protection.md](../decisions/ssrf-protection.md).

### 4. Fetching

The safe fetch issues the request through the SSRF-validated transport with
bounded limits — connection timeout, total timeout, maximum redirects and
maximum response size — all of which are validated configuration rather than
hardcoded constants. The response is accepted only for content types the
analyzers can work with; oversized or timed-out responses are rejected with a
classified error.

### 5. HTML normalization

The fetched HTML is parsed **once** with Cheerio and reduced to a single
`NormalizedWebsiteDocument`: title, meta description, canonical, robots meta,
viewport, charset, doctype, language, Open Graph tags, headings, links, images,
scripts, stylesheets, inline sizes, visible text, paragraphs, form controls,
buttons, landmarks, duplicate ids and ARIA-misuse indicators. Analyzers consume
this document and never re-parse HTML, which keeps analysis cost linear and
guarantees all analyzers observe exactly the same input.

### 6. Analyzer execution

Five independent analyzers run over the normalized document:

| Analyzer | Category | Responsibility |
| --- | --- | --- |
| SEO | `seo` | Titles, meta descriptions, headings, canonical, robots, language, Open Graph, image alt text, links. |
| Technical | `technical` | HTTPS usage, HTTP status, canonical consistency, viewport, charset, doctype, security headers, sitemap reference, mixed content, `javascript:` links. |
| Content | `content` | Text length, word and paragraph counts, heading presence, text-to-markup ratio, duplicate text. |
| Accessibility | `accessibility` | Image alt text, form labels, `lang`, heading order, button/link accessible names, viewport, landmarks, duplicate ids, ARIA misuse. |
| Performance | `performance` | HTML size, script/stylesheet/image counts, external resources, inline script/style size, image dimensions, preload hints, compression and cache headers. |

Together these define 56 stable rule codes (`RuleCode`): 19 SEO, 10 technical,
6 content, 10 accessibility and 11 performance. A rule is a pure function from
the normalized document to either `null` or a finding; analyzers are registered
in an `AnalyzerRegistry` so adding a rule never modifies existing analyzers.

Each analyzer runs in isolation: if one throws, the engine records the failure
and continues with the rest, marking the run `PARTIALLY_COMPLETED` rather than
discarding all results.

### 7. Scoring

A category starts at 100 and each finding deducts its declared
`scoreImpact.points`; the result is clamped to `[0, 100]`. The overall score is
the weight-averaged category score:

| Category | Weight |
| --- | --- |
| SEO | 0.25 |
| Technical | 0.20 |
| Content | 0.20 |
| Accessibility | 0.15 |
| Performance | 0.20 |

Weights and deduction math are versioned (`SCORING_VERSION`). If a category's
analyzer failed, that category is omitted and the overall score is averaged over
the categories that did run, so a partial failure yields a partial-but-honest
score rather than a misleading zero.

### 8. Persistence

The worker persists the outcome in a single transaction: findings (one row per
rule code), score snapshots (one row per category plus an `overall` row), and
the final run status. The `(analysisRunId, ruleCode)` uniqueness constraint
doubles as an idempotency backstop — a redelivered job cannot duplicate a
finding. The run records the engine version and scoring version it was produced
with.

### 9. AI enrichment

Only after the deterministic result is committed does the worker enqueue an
`ai.enrich` job. AI reads the persisted deterministic result, produces an
explanation and prioritized recommendations, and is validated against the
findings before being stored. See
[ai-enrichment-flow.md](./ai-enrichment-flow.md).

## Deterministic scoring philosophy

Three properties are non-negotiable:

- **Reproducibility.** The engine version, scoring version and per-analyzer
  versions are recorded with every run. Given the same input and versions, the
  same findings and scores are produced. The test suite pins this with golden
  fixtures.
- **Explainability.** Every score deduction is attributable to a named rule
  code with attached evidence, so a score is never a black box.
- **Comparability.** Because findings are identified by stable rule codes and
  scores derive deterministically, two runs of the same website can be diffed
  meaningfully (new / resolved / unchanged findings, score deltas, severity
  transitions). See [../decisions/analysis-engine.md](../decisions/analysis-engine.md).

## Future considerations

- Multi-page crawling would extend the pipeline across documents; the
  normalized-document contract is already the right seam for it.
- New analyzers are additive: register a rule set under a category and it joins
  the pipeline and scoring without touching existing rules.
- Browser-rendered metrics (Core Web Vitals) would require a rendering step that
  is deliberately out of scope today; the scoring weights are versioned so
  introducing them is a scoring-version bump, not a breaking change.
