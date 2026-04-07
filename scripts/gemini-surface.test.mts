import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

describe('gemini surface', () => {
  it('publishes a root Gemini extension manifest with shared MCP wiring', () => {
    const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, 'package.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(FORGE_ROOT, 'gemini-extension.json'), 'utf8'));

    expect(manifest.name).toBe('forge');
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.contextFileName).toBe('GEMINI.md');
    expect(manifest.mcpServers.context7.url).toBe('https://mcp.context7.com/mcp');
  });

  it('ships explicit Forge commands and context for Gemini CLI', () => {
    expect(existsSync(join(FORGE_ROOT, 'GEMINI.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'commands', 'forge', 'continue.toml'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'commands', 'forge', 'info.toml'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'commands', 'forge', 'analyze.toml'))).toBe(true);

    const readme = readFileSync(join(FORGE_ROOT, 'GEMINI.md'), 'utf8');
    expect(readme).toContain('forge continue');
    expect(readme).toContain('/forge:continue');
  });
});
