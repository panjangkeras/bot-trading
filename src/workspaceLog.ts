import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const parentWorkspace = path.resolve(process.cwd(), '..');
const learningsDir = path.join(parentWorkspace, '.learnings');
const errorsFile = path.join(learningsDir, 'ERRORS.md');
const learningsFile = path.join(learningsDir, 'LEARNINGS.md');

function nowIso() {
  return new Date().toISOString();
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
}

function redact(text: string) {
  return text
    .replace(/(BITGET_API_KEY|BITGET_SECRET_KEY|BITGET_PASSPHRASE)=([^\s]+)/g, '$1=[REDACTED]')
    .replace(/(bg_[a-zA-Z0-9]+)/g, '[REDACTED_KEY]');
}

async function ensureDir() {
  await mkdir(learningsDir, { recursive: true });
}

export async function appendWorkspaceErrorLog(input: {
  area: string;
  summary: string;
  command?: string;
  mode?: 'paper' | 'live';
  error: string;
  likelyCause?: string;
  nextFix?: string;
}) {
  await ensureDir();
  const id = `ERR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
  const body = `\n---\n## [${id}] ${slugify(input.summary)}\n\n**Logged**: ${nowIso()}\n**Area**: ${input.area}\n**Mode**: ${input.mode ?? 'unknown'}\n\n### Summary\n${redact(input.summary)}\n\n### Context\n- Command: ${redact(input.command ?? 'n/a')}\n- Likely cause: ${redact(input.likelyCause ?? 'unknown')}\n- Suggested next fix: ${redact(input.nextFix ?? 'review logs and retry safely')}\n\n### Error\n\`\`\`text\n${redact(input.error)}\n\`\`\`\n`;
  await appendFile(errorsFile, body, 'utf8');
}

export async function appendWorkspaceLearningLog(input: {
  area: string;
  summary: string;
  details: string;
  tags?: string[];
}) {
  await ensureDir();
  const id = `LRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
  const body = `\n---\n## [${id}] best_practice\n\n**Logged**: ${nowIso()}\n**Area**: ${input.area}\n\n### Summary\n${redact(input.summary)}\n\n### Details\n${redact(input.details)}\n\n### Metadata\n- Tags: ${(input.tags ?? []).join(', ')}\n`;
  await appendFile(learningsFile, body, 'utf8');
}
