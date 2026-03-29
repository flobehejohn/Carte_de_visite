// @vitest-environment node

type FsModule = {
  readFileSync(path: string, encoding: 'utf8'): string;
};

type PathModule = {
  join(...parts: string[]): string;
};

declare function require(name: 'fs'): FsModule;
declare function require(name: 'path'): PathModule;
declare const process: {
  cwd(): string;
};

const fs = require('fs');
const path = require('path');

import { describe, expect, it } from 'vitest';

const FILE = path.join(
  process.cwd(),
  'src',
  'scene',
  'modules',
  'orbFluidParticles.js',
);

describe('orbFluidParticles integration', () => {
  it('uses a simplified additive material suitable for overlay rendering', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain('new THREE.MeshBasicMaterial({');
    expect(text).toContain('blending: THREE.AdditiveBlending');
    expect(text).toContain('depthWrite: false');
    expect(text).toContain('toneMapped: false');
  });

  it('defaults to composer exclusion on overlay layer', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain('excludeFromComposer: true');
    expect(text).toContain('renderLayer: ORB_OVERLAY_RENDER_LAYER');
    expect(text).toContain('mesh.layers.set(layer)');
    expect(text).toContain(
      'postprocessIsolation: layer !== ORB_BASE_RENDER_LAYER',
    );
  });

  it('exports a deterministic reset path for ritual restart', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain('export function resetFluidParticles(ctx)');
    expect(text).toContain('state.spawnAccumulator = 0;');
    expect(text).toContain('state.particles.length = 0;');
    expect(text).toContain('state.mesh.count = 0;');
  });

  it('supports persistent enabled toggling through config', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain(
      'export function setFluidParticlesEnabled(ctx, enabled)',
    );
    expect(text).toContain(
      'return setFluidParticlesConfig(ctx, { enabled: Boolean(enabled) });',
    );
  });
});
