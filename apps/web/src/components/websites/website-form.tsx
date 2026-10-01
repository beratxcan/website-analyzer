'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createWebsite } from '@/features/websites/api';
import { ApiClientError } from '@/lib/api/client';
import { Button, FieldError, Input, Label, Spinner } from '@/components/ui';

const websiteSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  // Basic client-side check; the backend remains authoritative.
  url: z
    .string()
    .min(1, 'URL is required')
    .refine((value) => /^https?:\/\/\S+$/i.test(value), 'URL must start with http:// or https://'),
});

type WebsiteFormValues = z.infer<typeof websiteSchema>;

export function WebsiteForm({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WebsiteFormValues>({ resolver: zodResolver(websiteSchema) });

  const mutation = useMutation({
    mutationFn: (values: WebsiteFormValues) => createWebsite(projectId, values),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: ['websites', projectId] });
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-3" noValidate>
      <div>
        <Label htmlFor="website-name">Name</Label>
        <Input id="website-name" placeholder="Example" {...register('name')} />
        {errors.name && <FieldError>{errors.name.message}</FieldError>}
      </div>
      <div>
        <Label htmlFor="website-url">URL</Label>
        <Input id="website-url" placeholder="https://example.com" {...register('url')} />
        {errors.url && <FieldError>{errors.url.message}</FieldError>}
      </div>
      {mutation.isError && (
        <FieldError>
          {mutation.error instanceof ApiClientError ? mutation.error.message : 'Failed to add website'}
        </FieldError>
      )}
      <Button type="submit" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? <Spinner /> : 'Add website'}
      </Button>
    </form>
  );
}