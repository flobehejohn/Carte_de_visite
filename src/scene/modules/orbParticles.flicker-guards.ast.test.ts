import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('orbParticles anti-flicker guards', () => {
  it('ne masque plus links/trails dans les branches de skip temporel et supprime le jitter stochastique', () => {
    const filePath = path.resolve(__dirname, './orbParticles.js');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('if (shouldSkipParticleWork(ctx)) {');
    expect(source).toContain('vel[idx] += nx * 0.04 * (1 + burst);');
    expect(source).toContain('vel[idx + 1] += ny * 0.04 * (1 + burst);');
    expect(source).toContain('vel[idx + 2] += nz * 0.04 * (1 + burst);');
    expect(source).not.toContain('(rnd(ctx) - 0.5) * 0.01');

    expect(source).not.toMatch(
      /if \(shouldSkipParticleWork\(ctx\)\)\s*\{\s*if \(ctx\.particlesLinks\) ctx\.particlesLinks\.visible = false;\s*return;\s*\}/m
    );

    expect(source).not.toMatch(
      /if \(shouldSkipParticleWork\(ctx\)\)\s*\{\s*if \(ctx\.particlesTrails\) ctx\.particlesTrails\.visible = false;\s*return;\s*\}/m
    );
  });
});
