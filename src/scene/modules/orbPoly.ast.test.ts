/* @vitest-environment node */

import fs from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceUrl = new URL('./orbPoly.js', import.meta.url);
const sourceText = fs.readFileSync(sourceUrl, 'utf8');
const sourceFile = ts.createSourceFile(
  'orbPoly.js',
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);

function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

function findFunctionDeclaration(
  name: string,
): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined;

  walk(sourceFile, (node) => {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
    }
  });

  return found;
}

describe('orbPoly AST governance locks', () => {
  it('route la normalisation via ownNonIndexedGeometry au lieu d’un toNonIndexed() brut dans applySubsampling()', () => {
    const applySubsampling = findFunctionDeclaration('applySubsampling');
    expect(applySubsampling).toBeDefined();

    let helperCallCount = 0;
    let rawToNonIndexedCount = 0;

    walk(applySubsampling!, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'ownNonIndexedGeometry'
      ) {
        helperCallCount += 1;
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'toNonIndexed'
      ) {
        rawToNonIndexedCount += 1;
      }
    });

    expect(helperCallCount).toBeGreaterThan(0);
    expect(rawToNonIndexedCount).toBe(0);
  });

  it('expose explicitement la politique d’isolation cloneIfAlreadyNonIndexed', () => {
    expect(sourceText).toContain('export function ownNonIndexedGeometry');
    expect(sourceText).toContain('cloneIfAlreadyNonIndexed');
  });
});
