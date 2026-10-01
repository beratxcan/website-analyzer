import { describe, expect, it } from 'vitest';
import { buildReportFilename, toSafeSlug } from '../src/filename';

describe('buildReportFilename', () => {
  it('builds a predictable filename from host and date', () => {
    expect(
      buildReportFilename({ host: 'example.com', date: '2026-09-06T10:00:00.000Z' }),
    ).toBe('example-com-analysis-2026-09-06.pdf');
  });

  it('strips the www prefix', () => {
    expect(
      buildReportFilename({ host: 'www.example.com', date: '2026-09-06T10:00:00.000Z' }),
    ).toBe('example-com-analysis-2026-09-06.pdf');
  });

  it('supports a comparison kind', () => {
    expect(
      buildReportFilename({
        host: 'example.com',
        date: '2026-09-06T10:00:00.000Z',
        kind: 'comparison',
      }),
    ).toBe('example-com-comparison-2026-09-06.pdf');
  });

  it('never emits path separators or traversal sequences', () => {
    const filename = buildReportFilename({
      host: '../../etc/passwd',
      date: '2026-09-06T10:00:00.000Z',
    });
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\\');
    expect(filename).not.toContain('..');
    expect(filename).toBe('etc-passwd-analysis-2026-09-06.pdf');
  });

  it('normalizes quotes, unicode and punctuation in the host', () => {
    expect(toSafeSlug('"evil"; drop table--users')).toBe('evil-drop-table-users');
    expect(toSafeSlug('İçerik Örneği')).toBe('icerik-ornegi');
    expect(toSafeSlug('   ')).toBe('website');
    expect(toSafeSlug('<script>')).toBe('script');
  });

  it('bounds the slug length', () => {
    const slug = toSafeSlug('a'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.startsWith('aaaa')).toBe(true);
  });

  it('falls back to a safe date when the timestamp is invalid', () => {
    expect(buildReportFilename({ host: 'example.com', date: 'not-a-date' })).toBe(
      'example-com-analysis-unknown-date.pdf',
    );
  });

  it('falls back to a generic slug for an empty host', () => {
    expect(buildReportFilename({ host: '', date: '2026-09-06T10:00:00.000Z' })).toBe(
      'website-analysis-2026-09-06.pdf',
    );
  });
});
