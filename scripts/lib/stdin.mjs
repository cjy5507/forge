// Shared stdin reader for Forge hook scripts
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
