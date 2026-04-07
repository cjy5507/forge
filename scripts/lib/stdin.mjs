// Shared stdin reader for Forge hook scripts
//
// Host compatibility: Every Forge hook script wraps readStdin() in a try/catch
// and returns { continue: true } on any rejection (empty stdin, timeout, parse
// error).  This means scripts degrade gracefully on plugin hosts that do not
// fire a particular event — the process exits 0 and Claude Code / Codex / any
// future host continues normally.  Do not change the rejection paths to
// process.exit() calls; the silent-pass behaviour is intentional.
export async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    let resolved = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      // Empty stdin means the host did not send an event payload (e.g. the
      // event is not supported on this host).  Reject so the caller can
      // silently pass through.
      if (!data.trim()) {
        reject(new Error('Forge hook received empty stdin'));
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', err => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(err);
    });
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error('Forge hook stdin timeout'));
    }, 1500);
  });
}
