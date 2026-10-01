'use client';

import type { ComparisonResultDto, FindingChangeDto } from '@analyzer/contracts';
import { Badge, Card, EmptyState } from '@/components/ui';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-sky-700',
};

type Tone = 'positive' | 'negative' | 'neutral';

const TONE_STYLES: Record<Tone, string> = {
  positive: 'text-emerald-700',
  negative: 'text-rose-700',
  neutral: 'text-slate-700',
};

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null;
  return <Badge className={SEVERITY_STYLES[severity] ?? ''}>{severity}</Badge>;
}

function SeverityTransition({ finding }: { finding: FindingChangeDto }) {
  if (finding.change !== 'unchanged' || !finding.leftSeverity || !finding.rightSeverity) {
    return null;
  }
  if (finding.leftSeverity === finding.rightSeverity) {
    return <span className="text-xs text-slate-400">severity unchanged</span>;
  }
  const improved = finding.severityChange === 'improved';
  const label = improved ? 'Improved' : 'Regressed';
  return (
    <span className="flex items-center gap-1 text-xs">
      <Badge className={SEVERITY_STYLES[finding.leftSeverity] ?? ''}>{finding.leftSeverity}</Badge>
      <span aria-hidden="true" className="text-slate-400">
        →
      </span>
      <Badge className={SEVERITY_STYLES[finding.rightSeverity] ?? ''}>{finding.rightSeverity}</Badge>
      <span className={improved ? 'font-medium text-emerald-700' : 'font-medium text-rose-700'}>
        {label}
      </span>
    </span>
  );
}

function FindingRow({ finding }: { finding: FindingChangeDto }) {
  return (
    <li className="border-b border-slate-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{finding.title}</span>
        <SeverityBadge severity={finding.rightSeverity ?? finding.leftSeverity} />
        <Badge className="bg-slate-100 text-slate-600">{finding.category}</Badge>
      </div>
      <code className="mt-1 block text-xs text-slate-500">{finding.ruleCode}</code>
      <div className="mt-1.5">
        <SeverityTransition finding={finding} />
      </div>
    </li>
  );
}

function ChangeSection({
  title,
  description,
  findings,
  tone,
  emptyTitle,
}: {
  title: string;
  description: string;
  findings: FindingChangeDto[];
  tone: Tone;
  emptyTitle: string;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className={`text-sm font-semibold ${TONE_STYLES[tone]}`}>
          {title} <span className="text-slate-400">({findings.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {findings.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} />
        </div>
      ) : (
        <ul className="px-4 py-1">
          {findings.map((finding) => (
            <FindingRow key={`${finding.change}-${finding.ruleCode}`} finding={finding} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Resolved, new and unchanged findings, plus severity movements. */
export function FindingChanges({ comparison }: { comparison: ComparisonResultDto }) {
  const { resolved, new: added, unchanged } = comparison.findingChanges;
  const { improvedCount, regressedCount } = comparison.summary;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Resolved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{resolved.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">New</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{added.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Severity improved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{improvedCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Severity regressed</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{regressedCount}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChangeSection
          title="Resolved Issues"
          description="Present in the previous run, gone in the current one."
          findings={resolved}
          tone="positive"
          emptyTitle="No issues were resolved between these runs"
        />
        <ChangeSection
          title="New Issues"
          description="First seen in the current run."
          findings={added}
          tone="negative"
          emptyTitle="No new issues appeared in the current run"
        />
        <ChangeSection
          title="Unchanged Issues"
          description="Present in both runs; severity movements are highlighted."
          findings={unchanged}
          tone="neutral"
          emptyTitle="No issues are shared by both runs"
        />
      </div>
    </div>
  );
}
