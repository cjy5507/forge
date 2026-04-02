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
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
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
      resolve({});
    }, 1500);
  });
}
