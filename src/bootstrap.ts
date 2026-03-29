import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const parentWorkspace = path.resolve(process.cwd(), '..');
const learningsDir = path.join(parentWorkspace, '.learnings');
const errorsFile = path.join(learningsDir, 'ERRORS.md');

function redact(text: string) {
  return text
    .replace(/(BITGET_API_KEY|BITGET_SECRET_KEY|BITGET_PASSPHRASE)=([^\s]+)/g, '$1=[REDACTED]')
    .replace(/(bg_[a-zA-Z0-9]+)/g, '[REDACTED_KEY]');
}

export async function logBootstrapError(message: string) {
  await mkdir(learningsDir, { recursive: true });
  const body = `\n---\n## [ERR-${Date.now()}] bootstrap-startup-failure\n\n**Logged**: ${new Date().toISOString()}\n**Area**: bootstrap\n\n### Summary\nApp failed before full startup.\n\n### Error\n\`\`\`text\n${redact(message)}\n\`\`\`\n`;
  await appendFile(errorsFile, body, 'utf8');
}
