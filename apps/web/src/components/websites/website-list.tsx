'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteWebsite, listWebsites, updateWebsite } from '@/features/websites/api';
import { ApiClientError } from '@/lib/api/client';
import { Button, Card, FieldError, Input, Spinner } from '@/components/ui';

function WebsiteRow({ projectId, website }: { projectId: string; website: { id: string; name: string; url: string; host: string } }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(website.name);
  const [url, setUrl] = useState(website.url);

  const updateMutation = useMutation({
    mutationFn: () => updateWebsite(website.id, { name, url }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['websites', projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWebsite(website.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['websites', projectId] });
    },
  });

  if (editing) {
    return (
      <Card>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Website name" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Website URL" />
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
    );
  }

  return (
    <Card className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{website.name}</p>
        <p className="truncate text-sm text-slate-500">
          {website.url} <span className="text-xs text-slate-400">· {website.host}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => router.push(`/websites/${website.id}`)}>
          Analyze
        </Button>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function WebsiteList({ projectId }: { projectId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['websites', projectId],
    queryFn: () => listWebsites(projectId),
  });

  if (isPending) {
    return <Spinner />;
  }
  if (isError) {
    return (
      <p className="text-sm text-rose-600">{error instanceof Error ? error.message : 'Unable to load websites'}</p>
    );
  }
  if (data.items.length === 0) {
    return <p className="text-sm text-slate-500">No websites yet — add your first target.</p>;
  }
  return (
    <ul className="space-y-3">
      {data.items.map((website) => (
        <li key={website.id}>
          <WebsiteRow projectId={projectId} website={website} />
        </li>
      ))}
    </ul>
  );
}