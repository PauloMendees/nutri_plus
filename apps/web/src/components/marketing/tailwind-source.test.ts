import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tailwind v4 skips gitignored paths when detecting class names.
 * An unanchored `marketing/` rule would hide this folder and drop
 * landing-page utilities (grid, padding, breakpoints) from the CSS.
 */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('repo root not found');
    }
    dir = parent;
  }
  return dir;
}

describe('gitignore vs Tailwind source detection', () => {
  it('does not ignore apps/web/src/components/marketing', () => {
    const gitignore = readFileSync(path.join(repoRoot(), '.gitignore'), 'utf8');
    const patterns = gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    const unanchoredMarketing = patterns.filter(
      (pattern) =>
        pattern === 'marketing' ||
        pattern === 'marketing/' ||
        pattern === '**/marketing/' ||
        pattern === '**/marketing/**',
    );

    expect(unanchoredMarketing).toEqual([]);
  });
});
