/**
 * Server-side PDF renderer.
 *
 * It consumes *only* a {@link ReportDocument} — no database, no Prisma, no
 * filesystem, no browser. `pdf-lib` is pure JavaScript, so the renderer works
 * identically in local development, Docker and CI.
 *
 * Determinism: document metadata dates are pinned to `metadata.generatedAt`,
 * content is sanitized up front, and layout is computed from fixed metrics, so
 * the same document always produces the same bytes.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { ReportDocument, ReportFinding, ReportFindingChange } from '../domain';
import { sanitizeText, toPrintable } from '../sanitize';

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 48;
const FOOTER_HEIGHT = 34;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const COLORS = {
  ink: rgb(0.09, 0.13, 0.19),
  body: rgb(0.28, 0.33, 0.41),
  muted: rgb(0.55, 0.6, 0.68),
  rule: rgb(0.88, 0.9, 0.92),
  accent: rgb(0.05, 0.4, 0.31),
  critical: rgb(0.75, 0.13, 0.22),
  high: rgb(0.72, 0.35, 0.05),
  medium: rgb(0.62, 0.47, 0.03),
  low: rgb(0.35, 0.4, 0.47),
};

const SEVERITY_COLORS: Record<string, RGB> = {
  critical: COLORS.critical,
  high: COLORS.high,
  medium: COLORS.medium,
  low: COLORS.low,
  info: COLORS.low,
};

interface TextOptions {
  font?: PDFFont;
  size?: number;
  color?: RGB;
  lineHeight?: number;
  indent?: number;
  spaceAfter?: number;
  maxWidth?: number;
}

/** Word wrapping with a hard-break fallback for pathologically long tokens. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  const push = (line: string): void => {
    if (line) lines.push(line);
  };

  for (const word of text.split(' ')) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    push(current);
    current = '';
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk) {
        push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  push(current);
  return lines;
}

/** Page-aware drawing cursor: owns pagination and the footer band. */
class PdfWriter {
  private page: PDFPage;
  private cursorY = PAGE.height - MARGIN;
  private readonly pages: PDFPage[] = [];
  private readonly contentBottom = MARGIN + FOOTER_HEIGHT;

  constructor(
    private readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(page);
    this.cursorY = PAGE.height - MARGIN;
    return page;
  }

  newPage(): void {
    this.page = this.addPage();
  }

  space(height: number): void {
    this.cursorY -= height;
  }

  ensure(height: number): void {
    if (this.cursorY - height < this.contentBottom) {
      this.newPage();
    }
  }

  text(value: unknown, options: TextOptions = {}): void {
    const font = options.font ?? this.regular;
    const size = options.size ?? 9.5;
    const color = options.color ?? COLORS.body;
    const lineHeight = options.lineHeight ?? size * 1.45;
    const indent = options.indent ?? 0;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH - indent;
    const content = sanitizeText(value, { maxLength: 4_000 });
    if (!content) return;

    for (const line of wrapText(content, font, size, maxWidth)) {
      this.ensure(lineHeight);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.cursorY - size,
        size,
        font,
        color,
      });
      this.cursorY -= lineHeight;
    }
    if (options.spaceAfter) this.space(options.spaceAfter);
  }

  /** Two-column row with a right-aligned value (score / delta tables). */
  row(label: string, value: string, options: { bold?: boolean; color?: RGB } = {}): void {
    const size = 9.5;
    const lineHeight = 16;
    this.ensure(lineHeight);
    const font = options.bold ? this.bold : this.regular;
    const color = options.color ?? COLORS.body;
    const left = sanitizeText(label, { maxLength: 80 });
    const right = sanitizeText(value, { maxLength: 40 });

    this.page.drawText(left, { x: MARGIN, y: this.cursorY - size, size, font, color });
    const rightWidth = font.widthOfTextAtSize(right, size);
    this.page.drawText(right, {
      x: PAGE.width - MARGIN - rightWidth,
      y: this.cursorY - size,
      size,
      font,
      color,
    });
    this.cursorY -= lineHeight;
  }

  divider(): void {
    this.ensure(14);
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursorY - 2 },
      end: { x: PAGE.width - MARGIN, y: this.cursorY - 2 },
      thickness: 0.7,
      color: COLORS.rule,
    });
    this.cursorY -= 12;
  }

  sectionTitle(value: string): void {
    // Keep a title glued to at least the first lines of its section.
    this.ensure(96);
    this.space(6);
    this.text(value, { font: this.bold, size: 12.5, color: COLORS.ink, spaceAfter: 2 });
  }

  bullets(values: readonly string[], color: RGB = COLORS.body): void {
    for (const value of values) {
      this.text(`\u2022  ${value}`, { color, indent: 10 });
    }
  }

  finishFooter(generatedAt: string): void {
    const day = toPrintable(generatedAt).slice(0, 10);
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: MARGIN - 4 },
        end: { x: PAGE.width - MARGIN, y: MARGIN - 4 },
        thickness: 0.6,
        color: COLORS.rule,
      });
      page.drawText(
        `AI SaaS Website Analyzer  |  Generated ${day}  |  Page ${index + 1} of ${total}`,
        { x: MARGIN, y: MARGIN - 18, size: 7.5, font: this.regular, color: COLORS.muted },
      );
    });
  }
}

/**
 * Renders a {@link ReportDocument} to PDF bytes. Stateless and reusable; the
 * returned buffer is what the API streams to the client.
 */
export class PdfReportRenderer {
  async render(document: ReportDocument): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const generatedAt = new Date(document.metadata.generatedAt);
    if (!Number.isNaN(generatedAt.getTime())) {
      pdf.setCreationDate(generatedAt);
      pdf.setModificationDate(generatedAt);
    }
    pdf.setProducer('AI SaaS Website Analyzer');
    pdf.setCreator('AI SaaS Website Analyzer');
    pdf.setTitle(`${document.metadata.title} - ${document.metadata.websiteName}`);
    pdf.setSubject('Website analysis report');

    const writer = new PdfWriter(pdf, regular, bold);
    this.drawCover(writer, document);
    this.drawExecutiveSummary(writer, document);
    this.drawScores(writer, document);
    this.drawFindings(writer, document);
    this.drawRecommendations(writer, document);
    if (document.comparison) {
      this.drawComparison(writer, document);
    }
    writer.finishFooter(document.metadata.generatedAt);

    return pdf.save();
  }

  private drawCover(writer: PdfWriter, document: ReportDocument): void {
    const { metadata } = document;
    writer.text('AI SaaS Website Analyzer', { font: writer.bold, size: 11, color: COLORS.accent });
    writer.space(2);
    writer.text(metadata.title, { font: writer.bold, size: 24, color: COLORS.ink, lineHeight: 30 });
    writer.divider();
    writer.text(metadata.websiteName, { font: writer.bold, size: 14, color: COLORS.ink });
    writer.text(metadata.websiteUrl, { size: 9.5, color: COLORS.muted });
    writer.space(6);
    writer.row('Analysis date', formatDate(metadata.analysisDate));
    writer.row('Run status', statusLabel(metadata.runStatus));
    writer.row('AI insights', aiLabel(metadata.aiStatus));
    writer.row('Engine / scoring', `${metadata.engineVersion} / ${metadata.scoringVersion}`);
    writer.space(8);

    const overall = document.scoreSummary.overall;
    writer.text('Overall score', { font: writer.bold, size: 10, color: COLORS.ink });
    writer.space(2);
    writer.text(overall === null ? 'n/a' : `${overall}`, {
      font: writer.bold,
      size: 34,
      color: overall === null ? COLORS.muted : COLORS.accent,
      lineHeight: 38,
    });
    writer.text(
      overall === null ? 'No overall score was persisted for this run.' : 'out of 100',
      { size: 9, color: COLORS.muted },
    );
    writer.space(6);
    writer.divider();
  }

  private drawExecutiveSummary(writer: PdfWriter, document: ReportDocument): void {
    const summary = document.executiveSummary;
    writer.sectionTitle('Executive Summary');
    writer.text(summary.headline, {
      font: writer.bold,
      size: 11,
      color: COLORS.ink,
      spaceAfter: 4,
    });
    writer.text(summary.overview, { spaceAfter: 6 });

    if (summary.strengths.length > 0) {
      writer.text('Strengths', {
        font: writer.bold,
        size: 9.5,
        color: COLORS.accent,
        spaceAfter: 2,
      });
      writer.bullets(summary.strengths);
    }
    if (summary.weaknesses.length > 0) {
      writer.space(2);
      writer.text('Weaknesses', {
        font: writer.bold,
        size: 9.5,
        color: COLORS.critical,
        spaceAfter: 2,
      });
      writer.bullets(summary.weaknesses);
    }
    if (summary.source === 'deterministic') {
      writer.space(2);
      writer.text(
        'AI insights were unavailable for this run; this summary was derived deterministically from the persisted analysis.',
        { size: 8, color: COLORS.muted, spaceAfter: 4 },
      );
    }
  }

  private drawScores(writer: PdfWriter, document: ReportDocument): void {
    writer.sectionTitle('Score Overview');
    writer.row('overall', scoreText(document.scoreSummary.overall), {
      bold: true,
      color: COLORS.ink,
    });
    for (const score of document.scoreSummary.categories) {
      writer.row(score.category, scoreText(score.score));
    }
    if (document.scoreSummary.categories.length === 0) {
      writer.text('No category scores were persisted for this run.', { color: COLORS.muted });
    }
  }

  private drawFindings(writer: PdfWriter, document: ReportDocument): void {
    writer.sectionTitle('Findings - Critical & High Priority');
    if (document.criticalFindings.length === 0) {
      writer.text('No critical or high severity findings were detected.', { color: COLORS.muted });
    } else {
      for (const finding of document.criticalFindings) {
        this.drawFinding(writer, finding);
      }
    }

    if (document.additionalFindings.length > 0) {
      writer.sectionTitle('Findings - Medium Priority');
      for (const finding of document.additionalFindings) {
        this.drawFinding(writer, finding);
      }
    }
  }

  private drawFinding(writer: PdfWriter, finding: ReportFinding): void {
    writer.ensure(56);
    writer.space(4);
    writer.text(finding.severity.toUpperCase(), {
      font: writer.bold,
      size: 8,
      color: SEVERITY_COLORS[finding.severity] ?? COLORS.low,
    });
    writer.text(finding.title, {
      font: writer.bold,
      size: 10,
      color: COLORS.ink,
      spaceAfter: 1,
    });
    writer.text(finding.ruleCode, { size: 8, color: COLORS.muted, spaceAfter: 2 });
    if (finding.description) {
      writer.text(finding.description, { spaceAfter: 2 });
    }
    writer.text(`Category: ${finding.category}   |   Score impact: -${finding.scoreImpact} points`, {
      size: 8.5,
      color: COLORS.body,
    });
    if (finding.evidence.length > 0) {
      writer.text('Evidence', { font: writer.bold, size: 8.5, color: COLORS.body });
      writer.bullets(finding.evidence, COLORS.body);
    }
    writer.divider();
  }

  private drawRecommendations(writer: PdfWriter, document: ReportDocument): void {
    writer.sectionTitle('Recommendations');
    if (document.recommendations.length === 0) {
      writer.text('No AI recommendations are available for this run.', { color: COLORS.muted });
      return;
    }
    for (const recommendation of document.recommendations) {
      writer.ensure(48);
      writer.text(recommendation.title, { font: writer.bold, size: 10, color: COLORS.ink });
      writer.text(
        `Priority: ${recommendation.priority}   |   Impact: ${recommendation.impact}   |   Effort: ${recommendation.effort}   |   Category: ${recommendation.category}`,
        { size: 8.5, color: COLORS.body },
      );
      if (recommendation.description) {
        writer.text(recommendation.description, { spaceAfter: 1 });
      }
      if (recommendation.relatedFindingCodes.length > 0) {
        writer.text(`Related findings: ${recommendation.relatedFindingCodes.join(', ')}`, {
          size: 8,
          color: COLORS.muted,
        });
      }
      writer.space(4);
    }
  }

  private drawComparison(writer: PdfWriter, document: ReportDocument): void {
    const comparison = document.comparison;
    if (!comparison) return;

    writer.sectionTitle('Comparison With Previous Analysis');
    writer.row('Previous analysis', formatDate(comparison.leftDate));
    writer.row('Current analysis', formatDate(comparison.rightDate));
    writer.row(
      'Overall score',
      `${scoreText(comparison.leftScore)} \u2192 ${scoreText(comparison.rightScore)}`,
      { bold: true, color: COLORS.ink },
    );
    writer.row('Overall change', deltaText(comparison.overallDelta), {
      bold: true,
      color: deltaColor(comparison.overallDelta),
    });
    writer.space(4);

    writer.text('Category changes', {
      font: writer.bold,
      size: 9.5,
      color: COLORS.ink,
      spaceAfter: 2,
    });
    for (const change of comparison.scoreChanges) {
      writer.row(
        change.category,
        `${scoreText(change.left)} \u2192 ${scoreText(change.right)}   (${deltaText(change.delta)})`,
      );
    }

    this.drawChangeSection(writer, 'Resolved issues', comparison.resolved, COLORS.accent);
    this.drawChangeSection(writer, 'New issues', comparison.new, COLORS.critical);
    this.drawChangeSection(writer, 'Improved findings', comparison.improved, COLORS.accent);
    this.drawChangeSection(writer, 'Regressed findings', comparison.regressed, COLORS.critical);
    writer.row('Unchanged findings', String(comparison.summary.unchangedCount));
  }

  private drawChangeSection(
    writer: PdfWriter,
    title: string,
    findings: ReportFindingChange[],
    color: RGB,
  ): void {
    writer.space(3);
    writer.text(`${title} (${findings.length})`, {
      font: writer.bold,
      size: 9.5,
      color,
      spaceAfter: 2,
    });
    if (findings.length === 0) {
      writer.text('None.', { size: 8.5, color: COLORS.muted });
      return;
    }
    for (const finding of findings) {
      const transition =
        finding.leftSeverity && finding.rightSeverity && finding.leftSeverity !== finding.rightSeverity
          ? ` (${finding.leftSeverity} \u2192 ${finding.rightSeverity})`
          : '';
      writer.text(`\u2022  ${finding.title}${transition}`, { indent: 10, size: 9 });
      writer.text(finding.ruleCode, { indent: 20, size: 8, color: COLORS.muted });
    }
  }
}

function scoreText(score: number | null): string {
  return score === null ? 'n/a' : `${score}/100`;
}

function deltaText(delta: number | null): string {
  if (delta === null) return 'n/a';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function deltaColor(delta: number | null): RGB {
  if (delta === null) return COLORS.muted;
  if (delta > 0) return COLORS.accent;
  if (delta < 0) return COLORS.critical;
  return COLORS.muted;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toPrintable(value).slice(0, 32) || 'unknown';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function statusLabel(status: ReportDocument['metadata']['runStatus']): string {
  return status === 'partially_completed' ? 'Partially completed' : 'Completed';
}

function aiLabel(status: ReportDocument['metadata']['aiStatus']): string {
  switch (status) {
    case 'completed':
      return 'Available';
    case 'failed':
      return 'Unavailable';
    case 'skipped':
      return 'Disabled';
    case 'pending':
    case 'running':
      return 'In progress';
    default:
      return 'Not requested';
  }
}
