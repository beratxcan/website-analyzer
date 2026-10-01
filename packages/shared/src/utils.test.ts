import { describe, expect, it } from 'vitest';
import { assertNever } from './assert-never';
import { asError } from './as-error';
import { isRecord } from './is-record';
import { sleep } from './sleep';
import { withTimeout } from './with-timeout';

describe('assertNever', () => {
  it('throws when called', () => {
    expect(() => assertNever(42 as never)).toThrow(/Unexpected value/);
  });
});

describe('asError', () => {
  it('passes Error instances through unchanged', () => {
    const error = new Error('boom');
    expect(asError(error)).toBe(error);
  });

  it('wraps strings and unknown values', () => {
    expect(asError('message').message).toBe('message');
    expect(asError(undefined)).toBeInstanceOf(Error);
  });
});

describe('isRecord', () => {
  it('accepts plain objects and rejects non-objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('rejects when the promise is too slow', async () => {
    await expect(withTimeout(sleep(200).then(() => 'late'), 20)).rejects.toThrow(
      /timed out/,
    );
  });
});