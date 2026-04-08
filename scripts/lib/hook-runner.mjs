import { readStdin } from './stdin.mjs';
import { withJsonReadCache } from './forge-io.mjs';

/**
 * Standard hook entry point. Reads stdin, calls handler, catches errors gracefully.
 * @param {Function} handler - async (input) => hookResult
 * @param {object} [options]
 * @param {string} [options.name] - hook name for error logging
 * @param {boolean} [options.failClosed] - if true, errors emit { continue: false } instead of true.
 *   Use for enforcement hooks (stop-guard) that must block when they can't verify safety.
 */
export async function runHook(handler, { name = 'unknown', failClosed = false } = {}) {
  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  try {
    await withJsonReadCache(() => handler(input));
  } catch (error) {
    // Log to file only (not stdout) to avoid corrupting hook JSON protocol
    try {
      const { logHookError } = await import('./error-handler.mjs');
      logHookError(error, name, input?.cwd || '.');
    } catch { /* logging failed */ }
    if (failClosed) {
      console.log(JSON.stringify({ continue: false, stopReason: `[Forge] ${name} failed closed: ${error.message}` }));
    } else {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  }
}
