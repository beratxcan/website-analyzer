/** Overall application health summary. */
export type HealthSummaryStatus = 'ok' | 'degraded';

/** Connectivity state of a single infrastructure component. */
export type HealthComponentStatus = 'up' | 'down';

/** Result of checking one infrastructure component. */
export interface HealthComponentCheck {
  status: HealthComponentStatus;
  /** Round-trip latency of the check, in milliseconds. */
  latencyMs?: number;
  /** Stable, non-sensitive error identifier when the component is down. */
  error?: string;
}

/**
 * Response body of `GET /health/live`.
 *
 * Liveness answers a single question — is the process running? — and never
 * touches infrastructure, so a dependency outage cannot restart the API.
 */
export interface LivenessResponse {
  status: 'ok';
  /** Service identifier, e.g. `api`. */
  service: string;
  /** Application version. */
  version: string;
  /** Process uptime in seconds. */
  uptimeSeconds: number;
  /** ISO-8601 timestamp of the check. */
  timestamp: string;
}

/**
 * Response body of `GET /health` and `GET /health/ready`.
 *
 * `GET /health` always answers HTTP 200 with this body (degraded included) so
 * probes can distinguish "process down" from "dependency degraded".
 * `GET /health/ready` answers HTTP 503 when any dependency is down.
 */
export interface HealthCheckResponse {
  status: HealthSummaryStatus;
  /** Service identifier, e.g. `api`. */
  service: string;
  /** Application version. */
  version: string;
  /** Process uptime in seconds. */
  uptimeSeconds: number;
  /** ISO-8601 timestamp of the check. */
  timestamp: string;
  checks: Record<string, HealthComponentCheck>;
}