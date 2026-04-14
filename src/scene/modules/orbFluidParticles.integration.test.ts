// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const JS_FILE = new URL('./orbFluidParticles.js', import.meta.url);

describe('orbFluidParticles integration', () => {
  it('uses an additive material suitable for overlay rendering', () => {
    const text = readFileSync(JS_FILE, 'utf8');

    expect(text).toContain('new THREE.MeshBasicMaterial({');
    expect(text).toContain('blending: THREE.AdditiveBlending');
    expect(text).toContain('depthWrite: false');
    expect(text).toContain('depthTest: true');
    expect(text).toContain('toneMapped: false');
  });

  it('defaults to composer exclusion on the overlay layer', () => {
    const text = readFileSync(JS_FILE, 'utf8');

    expect(text).toContain('excludeFromComposer: true');
    expect(text).toContain('renderLayer: ORB_OVERLAY_RENDER_LAYER');
    expect(text).toContain('mesh.layers.set(layer)');
    expect(text).toContain(
      'postprocessIsolation: layer !== ORB_BASE_RENDER_LAYER',
    );
  });

  it('exports a deterministic reset path for ritual restart', () => {
    const text = readFileSync(JS_FILE, 'utf8');

    expect(text).toContain('export function resetFluidParticles(ctx)');
    expect(text).toContain('state.spawnAccumulator = 0;');
    expect(text).toContain('state.particles.length = 0;');
    expect(text).toContain("log(ctx, 'Reset particules fluide.');");
  });

  it('synchronizes the legacy ctx.fluidParticles handle', () => {
    const text = readFileSync(JS_FILE, 'utf8');

    expect(text).toContain('function syncLegacyHandle(ctx, mesh = null)');
    expect(text).toContain('ctx.fluidParticles = mesh ?? null;');
    expect(text).toContain('syncLegacyHandle(ctx, mesh);');
    expect(text).toContain('syncLegacyHandle(ctx, null);');
  });

  it('supports persistent enabled toggling through config', () => {
    const text = readFileSync(JS_FILE, 'utf8');

    expect(text).toContain(
      'export function setFluidParticlesEnabled(ctx, enabled)',
    );
    expect(text).toContain(
      'return setFluidParticlesConfig(ctx, { enabled: Boolean(enabled) });',
    );
  });
});
