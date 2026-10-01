'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createProject } from '@/features/projects/api';
import { ApiClientError } from '@/lib/api/client';
import { Button, FieldError, Input, Label, Spinner } from '@/components/ui';

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(1000).optional().or(z.literal('')),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export function ProjectForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({ resolver: zodResolver(projectSchema) });

  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) =>
      createProject({
        name: values.name,
        description: values.description ? values.description : null,
      }),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-3" noValidate>
      <div>
        <Label htmlFor="project-name">Name</Label>
        <Input id="project-name" placeholder="My Website Project" {...register('name')} />
        {errors.name && <FieldError>{errors.name.message}</FieldError>}
      </div>
      <div>
        <Label htmlFor="project-description">Description (optional)</Label>
        <Input id="project-description" placeholder="What is this project about?" {...register('description')} />
      </div>
      {mutation.isError && (
        <FieldError>
          {mutation.error instanceof ApiClientError ? mutation.error.message : 'Failed to create project'}
        </FieldError>
      )}
      <Button type="submit" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? <Spinner /> : 'Create project'}
      </Button>
    </form>
  );
}