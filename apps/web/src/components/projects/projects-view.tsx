'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listProjects } from '@/features/projects/api';
import { Card, Spinner } from '@/components/ui';
import { ProjectForm } from './project-form';

export function ProjectsView() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-900">Your projects</h2>
        {isPending && (
          <Card>
            <Spinner />
          </Card>
        )}
        {isError && (
          <Card>
            <p className="text-sm text-rose-600">
              {error instanceof Error ? error.message : 'Unable to load projects'}
            </p>
          </Card>
        )}
        {data && data.items.length === 0 && (
          <Card>
            <p className="text-sm text-slate-500">No projects yet — create your first one.</p>
          </Card>
        )}
        {data && data.items.length > 0 && (
          <ul className="space-y-3">
            {data.items.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="block">
                  <Card className="transition-colors hover:border-slate-400">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
                      <span className="text-xs text-slate-400">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {project.description && (
                      <p className="mt-1 text-sm text-slate-500">{project.description}</p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-3 text-sm font-medium text-slate-900">New project</h2>
        <Card>
          <ProjectForm />
        </Card>
      </aside>
    </div>
  );
}