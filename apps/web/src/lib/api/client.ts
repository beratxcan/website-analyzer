import type { ApiErrorEnvelope } from '@analyzer/contracts';
import { getApiBaseUrl } from '@/lib/env';

/** A binary response (e.g. a PDF report) with its server-provided filename. */
export interface DownloadedFile {
  blob: Blob;
  filename: string | null;
}

/** Extracts the filename from a `Content-Disposition` header, if present. */
function filenameFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1]?.trim() || null;
}

/** Error thrown for non-2xx API responses, shaped like the backend envelope. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const AUTH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

class ApiClient {
  private refreshing: Promise<boolean> | null = null;
  /** Invoked when the session can no longer be refreshed (e.g. redirect to /login). */
  onSessionExpired: () => void = () => undefined;

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchWithAuth(path, init);
    if (!response.ok) {
      throw await this.toError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  /** Fetches a binary resource with the same auth/refresh handling as `request`. */
  async download(path: string): Promise<DownloadedFile> {
    const response = await this.fetchWithAuth(path, {});
    if (!response.ok) {
      throw await this.toError(response);
    }
    return {
      blob: await response.blob(),
      filename: filenameFromHeader(response.headers.get('content-disposition')),
    };
  }

  private async fetchWithAuth(path: string, init: RequestInit, allowRefresh = true): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (response.status === 401 && allowRefresh && !AUTH_PATHS.includes(path)) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.fetchWithAuth(path, init, false);
      }
    }
    return response;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        this.onSessionExpired();
        return false;
      }
      return true;
    } catch {
      this.onSessionExpired();
      return false;
    }
  }

  private async toError(response: Response): Promise<ApiClientError> {
    let envelope: ApiErrorEnvelope | undefined;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // non-JSON error body
    }
    const error = envelope?.error;
    return new ApiClientError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? response.statusText,
      error?.details,
    );
  }
}

export const apiClient = new ApiClient();