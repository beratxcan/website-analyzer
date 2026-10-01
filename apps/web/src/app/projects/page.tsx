import { AppHeader } from '@/components/app-header';
import { ProjectsView } from '@/components/projects/projects-view';

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">Projects</h1>
        <ProjectsView />
      </main>
    </div>
  );
}