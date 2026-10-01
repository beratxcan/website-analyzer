/**
 * Local OpenAI-compatible stub for development smoke tests when no real
 * provider API key is available.
 *
 * Serves `POST /v1/chat/completions` and returns grounded, schema-valid
 * insights built from the finding codes it extracts from the user prompt —
 * so the full pipeline (HTTP adapter → schema validation → domain
 * validation → persistence) can be exercised end to end.
 *
 * Usage:  node infrastructure/ai-stub-server.mjs   (port 9999 by default)
 * Point the worker at it with AI_BASE_URL=http://localhost:9999/v1 and any
 * AI_API_KEY value. Never use this outside local development.
 */
import http from 'node:http';

const PORT = Number(process.env.AI_STUB_PORT ?? 9999);

function extractFindings(userPrompt) {
  const findings = [];
  // The finding title stops at the evidence marker (` | `) on the same
  // prompt line; it is truncated defensively to stay well within the
  // structured-output schema limits.
  const pattern = /- \[([A-Z0-9_]+)\] \(([a-z]+), ([a-z]+), -(\d+)\): ([^\n|]*)/g;
  let match;
  while ((match = pattern.exec(userPrompt)) !== null) {
    findings.push({
      code: match[1],
      category: match[2],
      severity: match[3],
      points: Number(match[4]),
      title: match[5].trim().slice(0, 80),
    });
  }
  return findings;
}

const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'low' };
const IMPACT = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };

function buildInsights(userPrompt) {
  const findings = extractFindings(userPrompt);
  const scoreMatch = userPrompt.match(/Overall score: (\d+)\/100/);
  const hostMatch = userPrompt.match(/Website: ([^ ]+) \(/);
  const top = findings.slice(0, 3);
  return {
    summary: {
      headline: scoreMatch
        ? `Overall score ${scoreMatch[1]}/100 — clear next steps available`
        : 'Analysis complete',
      overview: `The deterministic audit of ${hostMatch?.[1] ?? 'the website'} found ${
        findings.length
      } issue(s) to act on.`,
      strengths: ['Deterministic analysis completed successfully'],
      weaknesses: top.map((finding) => finding.title),
    },
    recommendations: top.map((finding) => ({
      title: `Fix: ${finding.title}`,
      description: `Address the ${finding.code} finding (${finding.category}) identified by the deterministic analysis.`,
      priority: PRIORITY[finding.severity] ?? 'medium',
      effort: 'low',
      impact: IMPACT[finding.severity] ?? 'medium',
      category: finding.category,
      relatedFindingCodes: [finding.code],
    })),
  };
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const request = JSON.parse(body);
    const userPrompt =
      request.messages?.find((message) => message.role === 'user')?.content ?? '';
    const content = JSON.stringify(buildInsights(userPrompt));
    const payload = {
      id: `chatcmpl-stub-${Date.now()}`,
      model: request.model ?? 'stub-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(userPrompt.length / 4),
        completion_tokens: Math.ceil(content.length / 4),
        total_tokens: Math.ceil((userPrompt.length + content.length) / 4),
      },
    };
    console.log(`stub request model=${request.model} findings=${JSON.stringify(extractFindings(userPrompt).length)}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
});

server.listen(PORT, () => {
  console.log(`AI stub listening on http://localhost:${PORT}/v1/chat/completions`);
});