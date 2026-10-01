import { ApiStatus } from '@/components/api-status';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-400">
          Website Intelligence Platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          Website Analyzer
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Analyze any website across SEO, technical quality, accessibility, content quality and
          performance. Deterministic audits and historical tracking, enriched with AI-assisted
          recommendations.
        </p>

        <div className="mt-8 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-900">What it does</h2>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-slate-600 sm:grid-cols-2">
              {[
                'Technical quality and SEO audits',
                'Accessibility and content quality checks',
                'Performance signals',
                'Historical trends across analyses',
                'Prioritized findings and recommendations',
                'Comparison reports with PDF export',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-900">API connectivity</h2>
            <ApiStatus />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-slate-900">Stack</h2>
            <div className="flex flex-wrap gap-1.5">
              {['Next.js', 'NestJS', 'TypeScript', 'PostgreSQL', 'Redis', 'BullMQ'].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </section>
        </div>

        <div className="mt-8 flex gap-3">
          <a
            href="/login"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Log in
          </a>
          <a
            href="/register"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Create account
          </a>
        </div>

        <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Architecture and design decisions: <code className="text-slate-500">docs/architecture</code>
        </p>
      </div>
    </main>
  );
}