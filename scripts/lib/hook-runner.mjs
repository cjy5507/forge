import { readStdin } from './stdin.mjs';

/**
 * Standard hook entry point. Reads stdin, calls handler, catches errors gracefully.
 * @param {Function} handler - async (input) => hookResult
 * @param {object} [options]
 * @param {string} [options.name] - hook name for error logging
 */
export async function runHook(handler, { name = 'unknown' } = {}) {
  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  try {
    await handler(input);
  } catch (error) {
    // Import handleHookError dynamically to avoid circular deps
    try {
      const { handleHookError } = await import('./error-handler.mjs');
      handleHookError(error, name, input?.cwd || '.');
    } catch {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  }
}
