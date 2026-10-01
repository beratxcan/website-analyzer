/**
 * Prompt registry. Prompt strings never live inside services: each task maps
 * to a versioned prompt definition here, and every AI result persists the
 * prompt + schema versions that produced it.
 */
import type { AITask } from '../domain';

export interface PromptDefinition {
  task: AITask;
  promptVersion: string;
  schemaVersion: string;
}

export interface RegisteredPrompt extends PromptDefinition {
  /** Builds the system prompt for a task. */
  system(): string;
  /** Builds the user prompt for a task. */
  user(context: unknown, options: Record<string, unknown>): string;
}

const registry = new Map<AITask, RegisteredPrompt>();

export function registerPrompt(prompt: RegisteredPrompt): void {
  registry.set(prompt.task, prompt);
}

export function getPrompt(task: AITask): RegisteredPrompt | undefined {
  return registry.get(task);
}

/** All registered tasks (used for validation and documentation). */
export function registeredTasks(): AITask[] {
  return [...registry.keys()];
}