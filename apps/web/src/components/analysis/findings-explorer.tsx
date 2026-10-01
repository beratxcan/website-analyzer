'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { AnalysisFindingDto, FindingsSort } from '@analyzer/contracts';
import { getFindings } from '@/features/analyses/api';
import { Badge, Button, Card, EmptyState, Input, Pagination, Skeleton } from '@/components/ui';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-sky-700',
};

const CATEGORY_OPTIONS = ['seo', 'technical', 'content', 'accessibility', 'performance'];
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];
const SORT_OPTIONS: Array<{ value: FindingsSort; label: string }> = [
  { value: 'severity', label: 'Severity' },
  { value: 'impact', label: 'Score impact' },
  { value: 'code', label: 'Rule code' },
  { value: 'newest', label: 'Newest' },
];

const columnHelper = createColumnHelper<AnalysisFindingDto>();

const columns = [
  columnHelper.accessor('ruleCode', {
    header: 'Rule',
    cell: (info) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{info.getValue()}</code>,
  }),
  columnHelper.accessor('title', {
    header: 'Finding',
    cell: (info) => <span className="text-sm font-medium text-slate-900">{info.getValue()}</span>,
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => <span className="text-sm text-slate-600">{info.getValue()}</span>,
  }),
  columnHelper.accessor('severity', {
    header: 'Severity',
    cell: (info) => (
      <Badge className={SEVERITY_STYLES[info.getValue()] ?? ''}>{info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor('scoreImpact', {
    header: 'Impact',
    cell: (info) => (
      <span className="text-sm font-medium text-rose-600">−{info.getValue()}</span>
    ),
  }),
];

function selectClasses() {
  return 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none';
}

export function FindingsExplorer({
  analysisId,
  onSelect,
}: {
  analysisId: string;
  onSelect: (finding: AnalysisFindingDto) => void;
}) {
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FindingsSort>('severity');
  const [page, setPage] = useState(1);

  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ['analyses', analysisId, 'findings', { severity, category, search, sort, page }],
    queryFn: () =>
      getFindings(analysisId, {
        severity: severity || undefined,
        category: category || undefined,
        search: search || undefined,
        sort,
        page,
        limit: 10,
      }),
    placeholderData: (previous) => previous,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 10));

  const table = useReactTable<AnalysisFindingDto>({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const resetPage = () => setPage(1);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold text-slate-900">Findings Explorer</h2>
        <select
          aria-label="Filter by severity"
          value={severity}
          onChange={(event) => {
            setSeverity(event.target.value);
            resetPage();
          }}
          className={selectClasses()}
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            resetPage();
          }}
          className={selectClasses()}
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort findings"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as FindingsSort);
            resetPage();
          }}
          className={selectClasses()}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            resetPage();
          }}
        >
          <Input
            aria-label="Search findings"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-40"
          />
          <Button variant="secondary" type="submit">
            Search
          </Button>
        </form>
      </div>

      {isPending && (
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {isError && <p className="px-4 py-6 text-sm text-rose-600">Unable to load findings.</p>}
      {!isPending && !isError && (data?.total ?? 0) === 0 && (
        <div className="p-4">
          <EmptyState
            title="No findings match"
            description={
              severity || category || search
                ? 'Try clearing the filters.'
                : 'This run produced no findings.'
            }
          />
        </div>
      )}
      {!isPending && !isError && (data?.total ?? 0) > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-slate-100 bg-slate-50/60">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className={isFetching ? 'opacity-60' : ''}>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(row.original)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}