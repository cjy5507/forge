import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);

describe('qwen surface', () => {
  it('publishes a native Qwen extension manifest wired to Forge skills and agents', () => {
    const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, 'package.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(FORGE_ROOT, 'qwen-extension.json'), 'utf8'));

    expect(manifest.name).toBe('forge');
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.contextFileName).toBe('QWEN.md');
    expect(manifest.commands).toBe('qwen-commands');
    expect(manifest.skills).toBe('skills');
    expect(manifest.agents).toBe('agents');
    expect(manifest.mcpServers.context7.url).toBe('https://mcp.context7.com/mcp');
  });

  it('ships explicit Qwen commands and context alongside native skills and agents', () => {
    expect(existsSync(join(FORGE_ROOT, 'QWEN.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'qwen-commands', 'forge', 'continue.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'qwen-commands', 'forge', 'info.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'qwen-commands', 'forge', 'analyze.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'skills', 'ignite', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, 'agents', 'fact-checker.md'))).toBe(true);

    const context = readFileSync(join(FORGE_ROOT, 'QWEN.md'), 'utf8');
    expect(context).toContain('forge continue');
    expect(context).toContain('/forge:*');
  });
});
