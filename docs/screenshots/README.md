# Screenshots

## Purpose

The captured screenshots that document the product in the repository, together
with the conventions used to produce them so the set stays consistent and
reproducible as the UI evolves.

## Scope

Seven screens that communicate the product from overview to report. It does not
cover marketing assets, animated demos, empty or error states, tooling screens
(terminal, editor, database, Redis or API explorer) or source listings. Every
image is a real capture of the running application — no mock-ups and no edited or
fabricated data.

## Capture environment

- **Application.** The full local stack: web (`apps/web`), API (`apps/api`) and
  worker (`apps/worker`), with PostgreSQL and Redis from
  `infrastructure/docker-compose.yml`, started with `pnpm db:up` and the
  development processes.
- **Browser.** Headless Chromium (Microsoft Edge 153) driven over the DevTools
  Protocol, at a fixed **1440 × 900** viewport and device scale factor 1, light
  theme. No browser chrome.
- **Data.** A seeded demo account (`pnpm --filter @analyzer/api db:seed`) plus
  real analyses of a public website. At least two completed runs of the same
  website exist so trends and comparison have genuine history.
- **Redaction.** No personal data, credentials, tokens, local paths or internal
  tooling is visible; rule codes and finding evidence are the product's own
  output.

## Screenshot inventory

| File | Route / source | Capture state | Purpose |
| --- | --- | --- | --- |
| `dashboard.png` | `/dashboard` | Authenticated, multiple completed analyses | Overview: stat cards, recent analyses, top issues, activity feed |
| `analysis-details.png` | `/analyses/<id>` | Completed run with a previous run | Core result: status, overall score, per-category scores with deltas |
| `findings-explorer.png` | `/analyses/<id>` (findings section) | Completed run, finding drawer open | Depth: filters, search, pagination, severity/category, evidence drawer |
| `trends.png` | `/websites/<id>` | Website with several completed runs | History: overall and per-category score trends, analysis history |
| `comparison.png` | `/analyses/compare?websiteId=<id>` | Two completed runs selected | Differentiator: score deltas and new/resolved/unchanged findings |
| `ai-recommendations.png` | `/analyses/<id>` (AI region) | Run with AI enrichment completed | AI-assisted recommendations grounded in the deterministic findings |
| `report.png` | Generated PDF (`Download Report`) | Rendered report PDF | Shareable output: executive summary, scores, findings, recommendations |

### Intentionally excluded

- **Login / register** — authentication is not the product; documented in prose.
- **Empty, loading and error states** — engineering detail, not product story.
- **Projects list** — consistent with the story but redundant beside the dashboard.
- **Swagger/OpenAPI, terminal, database and Redis UIs, source code** — internal tooling, never published.

## Demo flow

A 2–3 minute walkthrough that uses only existing functionality:

1. Open the **dashboard**.
2. Select a **website** through its project.
3. Start an analysis with **Run analysis**.
4. Watch the **asynchronous state** (Queued → Running) as the worker picks up the job.
5. Open the **completed analysis**.
6. Inspect the **category scores** and their deltas.
7. Open the **findings explorer**, filter and search, and read a finding's **evidence**.
8. Show the **AI recommendations** layered on top of the deterministic results.
9. **Compare two runs** to show what improved and what regressed.
10. Generate and **download the report**.

## Portfolio story

Read in order, the set communicates, without narration:

1. **Product** — a clear website-analysis problem with a real UI (Dashboard).
2. **Depth** — the result is not one number: categories, findings, evidence, history and comparison (Analysis details, Findings explorer, Trends).
3. **Engineering** — asynchronous processing over a queue produces durable, comparable history (Trends, Comparison).
4. **AI** — a grounded enrichment layer on top of deterministic measurements (AI recommendations).
5. **Reporting** — results can be compared and exported (Comparison, Report).

## Public-surface check

Before committing an image, confirm that nothing visible exposes internal
material. No image may show:

- internal development artifact directories or hand-off notes (see
  [`.gitignore`](../../.gitignore));
- request text sent to an AI provider, provider or model configuration, or
  authoring-tool names;
- anything that implies how the repository was produced rather than what it does.

Product terminology — **AI Insights**, **AI Recommendations**,
**AI-assisted recommendations** — is expected and allowed. The AI Insights panel
renders only the user-facing summary and recommendations; request details,
provider and model configuration, and cost metadata are not displayed.

## Future considerations

- A scripted capture step (seeded data plus a fixed viewport) would make the set
  reproducible as the UI evolves and guard against drift.
- Short screen recordings could complement the static set for the analysis
  lifecycle and the report download.
- A documented contrast check would help keep the light theme readable in
  screenshots.
