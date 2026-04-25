import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const oracleScenePath = resolve(process.cwd(), 'src/components/oracle/Oracle3DScene.tsx');
const oracleSceneSource = readFileSync(oracleScenePath, 'utf8');

describe('Oracle3DScene StrictMode neutrality contract', () => {
  it('conserve un cleanup React explicite pour les effets runtime lourds', () => {
    expect(oracleSceneSource).toMatch(/return\s*\(\s*\)\s*=>/);
  });

  it('expose setQualityProfile via le bridge audit testable', () => {
    expect(oracleSceneSource).toContain('setQualityProfile');
    expect(oracleSceneSource).toContain('__ORB_AUDIT__');
  });

  it('ne remplace pas brutalement le bridge audit par un objet minimal', () => {
    expect(oracleSceneSource).not.toMatch(/window\.__ORB_AUDIT__\s*=\s*\{\s*ready\s*:/);
  });

  it('garde les opérations de reset/reinit auditables pour neutraliser les doubles montages StrictMode', () => {
    expect(oracleSceneSource).toContain('resetScene');
    expect(oracleSceneSource).toContain('counters');
  });
});