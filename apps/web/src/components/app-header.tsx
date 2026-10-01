'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getMe, logout } from '@/features/auth/api';
import { Button } from '@/components/ui';

export function AppHeader() {
  const { data } = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe });

  async function handleLogout() {
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold text-slate-900">
            Website Analyzer
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/dashboard" className="hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/projects" className="hover:text-slate-900">
              Projects
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {data?.user && <span className="text-sm text-slate-500">{data.user.email}</span>}
          <Button variant="secondary" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}