import '@testing-library/jest-dom/vitest';

// Recharts' ResponsiveContainer observes container size; jsdom has no
// ResizeObserver, so provide a no-op stub for component tests.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= ResizeObserverStub;