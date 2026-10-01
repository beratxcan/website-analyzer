'use client';

import type { AIResultDto, AnalysisFindingDto } from '@analyzer/contracts';
import { Badge, Button } from '@/components/ui';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-sky-700',
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

/** Compact, human-readable rendering of persisted evidence rows. */
function EvidenceList({ evidence }: { evidence: unknown }) {
  const items = normalizeEvidence(evidence);
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No evidence recorded.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {item}
        </li>
      ))}
    </ul>
  );
}

function normalizeEvidence(evidence: unknown): string[] {
  if (evidence === null || evidence === undefined) return [];
  if (typeof evidence === 'string') return [evidence];
  if (Array.isArray(evidence)) return evidence.flatMap((item) => normalizeEvidence(item));
  if (typeof evidence !== 'object') return [];
  const record = evidence as Record<string, unknown>;
  if (typeof record.type === 'string') {
    switch (record.type) {
      case 'html_attribute':
        return [`${record.selector}${record.attribute ? ` [${record.attribute}${record.value ? `=${record.value}` : ''}]` : ''}`];
      case 'html_missing':
        return [`missing ${record.selector}`];
      case 'metric':
        return [`${record.metric} = ${record.value}${record.unit ? ` ${record.unit}` : ''}`];
      case 'header':
        return [`${record.name}: ${record.value ?? '(present)'}`];
      case 'text':
        return [String(record.text ?? '')];
      default:
        break;
    }
  }
  try {
    return [JSON.stringify(record)];
  } catch {
    return [];
  }
}

/**
 * Side drawer with the full detail of one finding — no new page. AI
 * explanation and related recommendations come from the run's AI result.
 */
export function FindingDrawer({
  finding,
  ai,
  onClose,
}: {
  finding: AnalysisFindingDto | null;
  ai: AIResultDto | null;
  onClose: () => void;
}) {
  if (!finding) return null;

  const relatedRecommendations =
    ai?.recommendations?.filter((recommendation) =>
      recommendation.relatedFindingCodes.includes(finding.ruleCode),
    ) ?? [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Finding ${finding.ruleCode}`}>
      <button
        aria-label="Close finding details"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-slate-900/40"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {finding.ruleCode}
            </code>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
              {finding.title}
            </h2>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-6 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={SEVERITY_STYLES[finding.severity] ?? ''}>{finding.severity}</Badge>
            <Badge className="bg-slate-100 text-slate-600">{finding.category}</Badge>
            <Badge className="bg-slate-100 text-slate-600">−{finding.scoreImpact} points</Badge>
          </div>

          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Description
            </h3>
            <p className="text-sm leading-relaxed text-slate-700">{finding.description}</p>
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Evidence
            </h3>
            <EvidenceList evidence={finding.evidence} />
          </section>

          {ai && ai.status === 'completed' && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                AI Explanation
              </h3>
              {relatedRecommendations.length > 0 ? (
                <p className="text-sm leading-relaxed text-slate-700">
                  {relatedRecommendations[0]?.description}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  No AI explanation was generated for this specific finding.
                </p>
              )}
            </section>
          )}

          {ai && ai.status === 'completed' && relatedRecommendations.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                Related Recommendations
              </h3>
              <ul className="space-y-2">
                {relatedRecommendations.map((recommendation) => (
                  <li key={recommendation.title} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{recommendation.title}</p>
                      <Badge className={PRIORITY_STYLES[recommendation.priority] ?? ''}>
                        {recommendation.priority}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {recommendation.effort} effort · {recommendation.impact} impact
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}