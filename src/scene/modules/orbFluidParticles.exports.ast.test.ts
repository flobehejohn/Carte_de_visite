import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const jsPath = fileURLToPath(
  new URL('./orbFluidParticles.js', import.meta.url),
);
const dtsPath = fileURLToPath(
  new URL('./orbFluidParticles.d.ts', import.meta.url),
);

const expectedPublicExports = [
  'ORB_BASE_RENDER_LAYER',
  'ORB_OVERLAY_RENDER_LAYER',
  'ensureFluidParticlesConfig',
  'resetFluidParticles',
  'initFluidParticles',
  'buildFluidParticles',
  'setFluidParticlesEnabled',
  'setFluidParticlesConfig',
  'updateFluidParticles',
] as const;

function collectNamedExports(
  filePath: string,
  scriptKind: ts.ScriptKind,
): Set<string> {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? [])
      : [];

    const isExported = modifiers.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );

    if (!isExported) {
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }

  return names;
}

describe('orbFluidParticles public contract', () => {
  it('exports the expected named symbols from the JS module', () => {
    const jsExports = collectNamedExports(jsPath, ts.ScriptKind.JS);

    for (const symbolName of expectedPublicExports) {
      expect(jsExports.has(symbolName)).toBe(true);
    }
  });

  it('declares the same named symbols in the adjacent declaration file', () => {
    const dtsExports = collectNamedExports(dtsPath, ts.ScriptKind.TS);

    for (const symbolName of expectedPublicExports) {
      expect(dtsExports.has(symbolName)).toBe(true);
    }
  });
});
