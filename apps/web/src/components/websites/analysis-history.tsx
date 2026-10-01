'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { WebsiteAnalysisListItemDto } from '@analyzer/contracts';
import { getWebsiteAnalyses } from '@/features/websites/api';
import { Badge, Card, EmptyState, Pagination, Skeleton } from '@/components/ui';

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-sky-100 text-sky-700',
  pending: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const AI_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-sky-100 text-sky-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
  skipped: 'bg-slate-100 text-slate-500',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const columnHelper = createColumnHelper<WebsiteAnalysisListItemDto>();

const columns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => <span className="text-sm text-slate-600">{formatDate(info.getValue())}</span>,
  }),
  columnHelper.accessor('overallScore', {
    header: 'Overall Score',
    cell: (info) => (
      <span className="text-sm font-semibold text-slate-900">
        {info.getValue() !== null ? `${info.getValue()}/100` : '—'}
      </span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <Badge className={STATUS_STYLES[info.getValue()] ?? STATUS_STYLES.pending}>{info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor('aiStatus', {
    header: 'AI Status',
    cell: (info) => {
      const status = info.getValue();
      return status ? (
        <Badge className={AI_STYLES[status] ?? AI_STYLES.skipped}>AI {status}</Badge>
      ) : (
        <span className="text-sm text-slate-400">—</span>
      );
    },
  }),
];

export function AnalysisHistory({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isPending, isError } = useQuery({
    queryKey: ['websites', websiteId, 'analyses', page],
    queryFn: () => getWebsiteAnalyses(websiteId, page, pageSize),
    placeholderData: (previous) => previous,
  });

  const table = useReactTable<WebsiteAnalysisListItemDto>({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Analysis History</h2>
      </div>
      {isPending && (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {isError && <p className="px-4 py-6 text-sm text-rose-600">Unable to load analysis history.</p>}
      {!isPending && !isError && (data?.total ?? 0) === 0 && (
        <div className="p-4">
          <EmptyState
            title="No analyses for this website"
            description="Click “Run analysis” to start the first audit."
          />
        </div>
      )}
      {!isPending && !isError && (data?.total ?? 0) > 0 && (
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
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/analyses/${row.original.id}`)}
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
          <div className="px-4 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </Card>
  );
}