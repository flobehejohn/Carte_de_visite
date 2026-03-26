// @vitest-environment node

type Dirent = {
  name: string;
  isDirectory(): boolean;
};

type FsModule = {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, opts: { withFileTypes: true }): Dirent[];
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
  'components',
  'oracle',
  'Oracle3DScene.tsx',
);

describe('Oracle3DScene audit integration', () => {
  it('uses composer overlay rendering without custom composer target', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain('const composer = new EffectComposer(renderer);');
    expect(text).not.toContain('new EffectComposer(renderer, composerTarget)');
    expect(text).toContain('camera.layers.set(ORB_BASE_RENDER_LAYER)');
    expect(text).toContain('camera.layers.set(ORB_OVERLAY_RENDER_LAYER)');
    expect(text).toContain('renderer.clearDepth()');
  });

  it('persists fluid visibility through config instead of mesh visibility only', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain(
      'localCtx.fluidParticlesConfig.enabled = Boolean(visible)',
    );
    expect(text).toContain(
      'localCtx.fluidParticlesConfig.excludeFromComposer = true',
    );
    expect(text).toContain(
      'localCtx.fluidParticlesConfig.renderLayer = ORB_OVERLAY_RENDER_LAYER',
    );
  });

  it('exposes a reset hook and performs lifecycle reset for new rituals', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain("const resetSceneView = (reason = 'manual') => {");
    expect(text).toContain(
      "resetScene: (reason = 'manual') => resetSceneView(reason)",
    );
    expect(text).toContain('if (freshIdle && wasBusy) {');
    expect(text).toContain("resetSceneViewRef.current?.('ritual-cycle-reset')");
  });

  it('scans feedback candidates only on the composer base layer', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    expect(text).toContain(
      'if (obj?.userData?.postprocessIsolation === true) return;',
    );
    expect(text).toContain(
      'if (!objectUsesLayer(obj, ORB_BASE_RENDER_LAYER)) return;',
    );
  });
});
