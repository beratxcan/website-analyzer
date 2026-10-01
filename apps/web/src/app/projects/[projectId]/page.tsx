'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button, Card, FieldError, Input, Spinner } from '@/components/ui';
import { WebsiteForm } from '@/components/websites/website-form';
import { WebsiteList } from '@/components/websites/website-list';
import { deleteProject, getProject, updateProject } from '@/features/projects/api';
import { ApiClientError } from '@/lib/api/client';

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: project, isPending, isError, error } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(projectId),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateProject(projectId, { name, description: description || null }),
    onSuccess: (updated) => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.setQueryData(['projects', projectId], updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push('/projects');
    },
  });

  if (isPending) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Spinner />
        </main>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Card>
            <p className="text-sm text-rose-600">
              {error instanceof Error ? error.message : 'Unable to load project'}
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => router.push('/projects')}>
              Back to projects
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {editing ? (
          <Card className="mb-6">
            <div className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="Project name" />
              <Input
                value={description ?? ''}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                aria-label="Project description"
              />
              {updateMutation.isError && (
                <FieldError>
                  {updateMutation.error instanceof ApiClientError ? updateMutation.error.message : 'Update failed'}
                </FieldError>
              )}
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
                {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setName(project.name);
                    setDescription(project.description ?? '');
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
                <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <section>
            <h2 className="mb-3 text-sm font-medium text-slate-900">Websites</h2>
            <WebsiteList projectId={projectId} />
          </section>
          <aside>
            <h2 className="mb-3 text-sm font-medium text-slate-900">Add website</h2>
            <Card>
              <WebsiteForm projectId={projectId} />
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}