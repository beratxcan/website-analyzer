'use client';

import { useQuery } from '@tanstack/react-query';
import { AppHeader } from '@/components/app-header';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { RecentAnalyses } from '@/components/dashboard/recent-analyses';
import { StatCards } from '@/components/dashboard/stat-cards';
import { TopIssues } from '@/components/dashboard/top-issues';
import { getDashboardOverview } from '@/features/dashboard/api';

export default function DashboardPage() {
  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: getDashboardOverview,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        </div>

        <StatCards data={overviewQuery.data} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentAnalyses />
          </div>
          <div>
            <TopIssues />
          </div>
        </div>

        <ActivityFeed />
      </main>
    </div>
  );
}