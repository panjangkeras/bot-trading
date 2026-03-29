import { logBootstrapError } from './bootstrap.js';

try {
  await import('./app.js');
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown bootstrap error';
  await logBootstrapError(message);
  throw error;
}
