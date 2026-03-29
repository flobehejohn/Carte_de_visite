/* @vitest-environment node */

import fs from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceUrl = new URL('./Oracle3DScene.tsx', import.meta.url);
const sourceText = fs.readFileSync(sourceUrl, 'utf8');
const sourceFile = ts.createSourceFile(
  'Oracle3DScene.tsx',
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function propertyChain(expression: ts.Expression): string[] | null {
  const unwrapped = unwrapExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    return [unwrapped.text];
  }

  if (ts.isPropertyAccessExpression(unwrapped)) {
    const left = propertyChain(unwrapped.expression);
    if (!left) return null;
    return [...left, unwrapped.name.text];
  }

  return null;
}

function findFunctionDeclaration(name: string): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined;

  walk(sourceFile, (node) => {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
    }
  });

  return found;
}

function enclosingFunctionName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;

  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }

    if (
      (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }

    current = current.parent;
  }

  return null;
}

function assignmentTargets(path: string[]): ts.BinaryExpression[] {
  const hits: ts.BinaryExpression[] = [];

  walk(sourceFile, (node) => {
    if (!ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;

    const chain = propertyChain(node.left);
    if (!chain) return;

    if (chain.length !== path.length) return;
    if (chain.every((segment, index) => segment === path[index])) {
      hits.push(node);
    }
  });

  return hits;
}

function findAuditBridgeObject(): ts.ObjectLiteralExpression | undefined {
  let objectLiteral: ts.ObjectLiteralExpression | undefined;

  walk(sourceFile, (node) => {
    if (objectLiteral || !ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;

    const chain = propertyChain(node.left);
    if (!chain) return;

    const lastTwo = chain.slice(-2);
    if (
      lastTwo.length === 2 &&
      lastTwo[0] === 'window' &&
      lastTwo[1] === '__ORB_AUDIT__' &&
      ts.isObjectLiteralExpression(node.right)
    ) {
      objectLiteral = node.right;
    }
  });

  return objectLiteral;
}

function findPropertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | undefined {
  return objectLiteral.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(sourceFile) === propertyName,
  );
}

describe('Oracle3DScene AST governance locks', () => {
  it('routes feedback scanning through objectUsesLayer instead of ad hoc layer-mask reads', () => {
    const fn = findFunctionDeclaration('findFeedbackCandidates');
    expect(fn).toBeDefined();

    let helperCallCount = 0;
    let directMaskReadCount = 0;

    walk(fn!, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'objectUsesLayer'
      ) {
        helperCallCount += 1;
      }

      if (ts.isPropertyAccessExpression(node) && node.name.text === 'mask') {
        directMaskReadCount += 1;
      }
    });

    expect(helperCallCount).toBeGreaterThan(0);
    expect(directMaskReadCount).toBe(0);
  });

  it('centralizes critical overlay writer fields inside ensureOverlayFluidIsolationConfig only', () => {
    const criticalPaths = [
      ['localCtx', 'fluidParticlesConfig', 'excludeFromComposer'],
      ['localCtx', 'fluidParticlesConfig', 'renderLayer'],
    ];

    for (const path of criticalPaths) {
      const assignments = assignmentTargets(path);
      expect(assignments.length).toBeGreaterThan(0);
      expect(
        assignments.every(
          (assignment) =>
            enclosingFunctionName(assignment) ===
            'ensureOverlayFluidIsolationConfig',
        ),
      ).toBe(true);
    }
  });

  it('keeps the reset bridge structurally exposed through __ORB_AUDIT__ and resetSceneViewRef', () => {
    const resetRefAssignments = assignmentTargets(['resetSceneViewRef', 'current']);
    expect(
      resetRefAssignments.some(
        (assignment) => assignment.right.getText(sourceFile) === 'resetSceneView',
      ),
    ).toBe(true);

    const auditBridge = findAuditBridgeObject();
    expect(auditBridge).toBeDefined();

    const resetSceneProperty = findPropertyAssignment(auditBridge!, 'resetScene');
    expect(resetSceneProperty).toBeDefined();
    expect(resetSceneProperty!.initializer.getText(sourceFile)).toContain(
      'resetSceneView',
    );
  });
});
