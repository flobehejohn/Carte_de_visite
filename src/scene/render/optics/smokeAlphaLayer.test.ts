import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('smokeAlphaLayer runtime exposure', () => {
  it('keeps smokeAlphaLayer wired into snapshot telemetry with runtime fallbacks', () => {
    const oracleFile = path.resolve(
      __dirname,
      '../../../components/oracle/Oracle3DScene.tsx',
    );
    const source = fs.readFileSync(oracleFile, 'utf8');

    expect(source).toContain('smokeAlphaLayer:');
    expect(source).toContain('localCtx.smokeAlphaLayer ??');
    expect(source).toContain('localCtx.volumeConfig?.smokeAlphaLayer ??');
    expect(source).toContain('localCtx.particlesConfig?.smokeAlphaLayer ??');
    expect(source).toContain('null,');
  });

  it('keeps transparency policy helpers exported for alpha-governed rendering', () => {
    const transparencyFile = path.resolve(__dirname, './transparency.ts');
    const source = fs.readFileSync(transparencyFile, 'utf8');

    expect(source).toContain('export function applyHysteresis(');
    expect(source).toContain('export function computeAlphaInPlace(');
    expect(source).toContain('export function computeTransparencyPolicy(');
  });
});
