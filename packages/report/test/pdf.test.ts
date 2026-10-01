import { describe, expect, it } from 'vitest';
import { ReportBuilder } from '../src/builder';
import { PdfReportRenderer } from '../src/render/pdf';
import { GENERATED_AT, makeComparison, makeSource } from './fixtures';

const builder = new ReportBuilder();
const renderer = new PdfReportRenderer();
const decoder = new TextDecoder('latin1');

describe('PdfReportRenderer', () => {
  it('produces a non-empty PDF with the correct magic bytes', async () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });
    const bytes = await renderer.render(document);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(decoder.decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect(decoder.decode(bytes.subarray(bytes.byteLength - 6))).toContain('%%EOF');
  });

  it('is deterministic: the same document renders identical bytes', async () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });
    const first = await renderer.render(document);
    const second = await renderer.render(document);

    expect(first.byteLength).toBe(second.byteLength);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('renders without AI, without findings and without scores', async () => {
    const document = builder.build(
      makeSource({ ai: null, findings: [], scores: [] }),
      { generatedAt: GENERATED_AT },
    );
    const bytes = await renderer.render(document);

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(decoder.decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('renders a comparison report including the diff sections', async () => {
    const document = builder.build(makeSource({ comparison: makeComparison() }), {
      generatedAt: GENERATED_AT,
    });
    const bytes = await renderer.render(document);

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(document.comparison).not.toBeNull();
  });

  it('renders partially completed runs', async () => {
    const document = builder.build(makeSource({ runStatus: 'partially_completed' }), {
      generatedAt: GENERATED_AT,
    });
    const bytes = await renderer.render(document);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it('survives hostile content (markup, emoji, control chars, huge strings)', async () => {
    const document = builder.build(
      makeSource({
        website: {
          name: '<img src=x onerror=alert(1)> 🚀 website',
          host: 'evil.example.com',
          url: 'https://evil.example.com/?q=<script>',
        },
        ai: {
          status: 'completed',
          summary: {
            headline: '\\u0000\u0007 Break \\n out',
            overview: `${'A'.repeat(5_000)} <b>bold</b> 🚀`,
            strengths: ['ok'],
            weaknesses: [],
          },
          recommendations: null,
        },
        findings: [
          {
            ruleCode: 'XSS_ATTEMPT',
            category: 'technical',
            severity: 'critical',
            title: '</text><script>alert(1)</script>',
            description: 'İçerik ğüşiöç 🚀 test',
            scoreImpact: 99,
            evidence: [{ type: 'text', text: '<svg onload=alert(1)> and more' }],
          },
        ],
      }),
      { generatedAt: GENERATED_AT },
    );

    const bytes = await renderer.render(document);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(decoder.decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('paginates very long finding lists without losing the final page', async () => {
    const findings = Array.from({ length: 60 }, (_, index) => ({
      ruleCode: `RULE_${index.toString().padStart(3, '0')}`,
      category: 'seo',
      severity: index % 2 === 0 ? 'high' : 'medium',
      title: `Finding number ${index}`,
      description: 'A description that is long enough to wrap across multiple lines in the PDF report so pagination gets exercised properly.',
      scoreImpact: 5,
      evidence: [{ type: 'metric', metric: 'count', value: index, unit: 'items' }],
    }));
    const document = builder.build(makeSource({ findings }), { generatedAt: GENERATED_AT });

    const bytes = await renderer.render(document);
    // A multi-page document is strictly larger than a single page one.
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(decoder.decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });
});
