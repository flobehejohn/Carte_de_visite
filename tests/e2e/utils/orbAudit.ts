import { expect, Page, TestInfo } from '@playwright/test';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface AuditBootState {
  exists: boolean;
  ready: boolean;
  hasReadyFn: boolean;
  hasSnapshotFn: boolean;
}

export interface MatchedMetric {
  name: string;
  path: string;
  value: JsonPrimitive;
}

export interface StructuralSmokeOptions {
  deviceKind: 'desktop' | 'mobile';
}

const METRIC_PATTERNS: Record<string, RegExp> = {
  drawCalls:
    /(?:^|\.)(?:drawCalls|render\.calls|rendererInfo\.render\.calls)$/i,
  triangles:
    /(?:^|\.)(?:triangles|render\.triangles|rendererInfo\.render\.triangles)$/i,
  visibleProbe:
    /(?:^|\.)(?:visibleProbe|visibility\.visible|visibility\.probe|visibility\.isVisible)$/i,

  avgLuma: /(?:^|\.)(?:avgLuma|lumaAverage|averageLuma|luminanceAverage)$/i,
  nonBlackRatio: /(?:^|\.)(?:nonBlackRatio)$/i,
  brightRatio: /(?:^|\.)(?:brightRatio)$/i,
  opacity: /(?:^|\.)(?:opacity|effectiveOpacity|opacityTarget)$/i,

  totalUpdateMs:
    /(?:^|\.)(?:totalUpdateMs|orchestratorTimings\.totalUpdateMs|timings\.totalUpdateMs)$/i,
  fluidMs:
    /(?:^|\.)(?:fluidMs|orchestratorTimings\.fluidMs|timings\.fluidMs)$/i,
  geometryMs:
    /(?:^|\.)(?:geometryMs|orchestratorTimings\.geometryMs|timings\.geometryMs)$/i,
  volumeMs:
    /(?:^|\.)(?:volumeMs|orchestratorTimings\.volumeMs|timings\.volumeMs)$/i,
};

function isScalar(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pathTokens(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function getAtPath(input: unknown, path: string): unknown {
  let current: unknown = input;

  for (const token of pathTokens(path)) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
      continue;
    }

    return undefined;
  }

  return current;
}

function expectPathExists(
  input: unknown,
  path: string,
  label?: string,
): unknown {
  const value = getAtPath(input, path);
  expect(
    value,
    label ?? `Le chemin ${path} doit exister dans le snapshot.`,
  ).not.toBeUndefined();
  return value;
}

function expectFiniteNumberAtPath(
  input: unknown,
  path: string,
  label?: string,
): number {
  const value = expectPathExists(input, path, label);
  expect(typeof value, label ?? `Le chemin ${path} doit être un nombre.`).toBe(
    'number',
  );
  expect(
    Number.isFinite(value as number),
    label ?? `Le chemin ${path} doit être un nombre fini.`,
  ).toBe(true);
  return value as number;
}

function expectNonNegativeFiniteNumberAtPath(
  input: unknown,
  path: string,
  label?: string,
): number {
  const value = expectFiniteNumberAtPath(input, path, label);
  expect(value >= 0, label ?? `Le chemin ${path} doit être >= 0.`).toBe(true);
  return value;
}

function expectStringAtPath(
  input: unknown,
  path: string,
  label?: string,
): string {
  const value = expectPathExists(input, path, label);
  expect(typeof value, label ?? `Le chemin ${path} doit être une chaîne.`).toBe(
    'string',
  );
  return value as string;
}

function expectBooleanAtPath(
  input: unknown,
  path: string,
  label?: string,
): boolean {
  const value = expectPathExists(input, path, label);
  expect(typeof value, label ?? `Le chemin ${path} doit être un booléen.`).toBe(
    'boolean',
  );
  return value as boolean;
}

function expectArrayAtPath(
  input: unknown,
  path: string,
  label?: string,
): unknown[] {
  const value = expectPathExists(input, path, label);
  expect(
    Array.isArray(value),
    label ?? `Le chemin ${path} doit être un tableau.`,
  ).toBe(true);
  return value as unknown[];
}

export function resolveBaseUrl(testInfo: TestInfo): string {
  const projectUse = testInfo.project.use as { baseURL?: string };
  const baseURL =
    projectUse.baseURL ??
    process.env.PLAYWRIGHT_TEST_BASE_URL ??
    process.env.E2E_BASE_URL ??
    process.env.BASE_URL;

  if (!baseURL) {
    throw new Error(
      [
        'Aucun baseURL Playwright détecté.',
        'Définis soit :',
        '- use.baseURL dans playwright.config.ts',
        '- ou PLAYWRIGHT_TEST_BASE_URL',
        '- ou E2E_BASE_URL',
        '- ou BASE_URL',
      ].join('\n'),
    );
  }

  return String(baseURL).replace(/\/$/, '');
}

export async function gotoOracleRoot(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const baseURL = resolveBaseUrl(testInfo);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
}

async function readBootState(page: Page): Promise<AuditBootState> {
  return page.evaluate(() => {
    const win = window as Window & {
      __ORB_AUDIT__?: {
        ready?: () => boolean;
        snapshot?: () => unknown;
      };
    };

    const audit = win.__ORB_AUDIT__;

    let ready = false;
    try {
      ready = Boolean(audit?.ready?.());
    } catch {
      ready = false;
    }

    return {
      exists: Boolean(audit),
      ready,
      hasReadyFn: typeof audit?.ready === 'function',
      hasSnapshotFn: typeof audit?.snapshot === 'function',
    };
  });
}

export async function waitForOrbAuditHandle(
  page: Page,
): Promise<AuditBootState> {
  await expect
    .poll(() => readBootState(page), {
      timeout: 20_000,
      intervals: [250, 500, 1_000],
      message:
        'window.__ORB_AUDIT__ doit être exposé avec ready() et snapshot().',
    })
    .toMatchObject({
      exists: true,
      hasReadyFn: true,
      hasSnapshotFn: true,
    });

  return readBootState(page);
}

export async function waitForOrbAuditReady(
  page: Page,
): Promise<AuditBootState> {
  await expect
    .poll(async () => (await readBootState(page)).ready, {
      timeout: 30_000,
      intervals: [250, 500, 1_000],
      message: 'window.__ORB_AUDIT__.ready() doit finir par retourner true.',
    })
    .toBe(true);

  return readBootState(page);
}

export async function readSerializableSnapshot(
  page: Page,
): Promise<Record<string, JsonValue>> {
  const snapshot = await page.evaluate(() => {
    const win = window as Window & {
      __ORB_AUDIT__?: Record<string, unknown> & {
        snapshot?: () => unknown;
      };
    };

    const audit = win.__ORB_AUDIT__;
    if (!audit || typeof audit.snapshot !== 'function') {
      return null;
    }

    const raw = audit.snapshot();
    const snapshotBase =
      raw && !Array.isArray(raw) && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};

    const snapshotQualityProfiles =
      snapshotBase.qualityProfiles &&
      typeof snapshotBase.qualityProfiles === 'object' &&
      !Array.isArray(snapshotBase.qualityProfiles)
        ? (snapshotBase.qualityProfiles as Record<string, unknown>)
        : {};

    const auditQualityProfiles =
      audit.qualityProfiles &&
      typeof audit.qualityProfiles === 'object' &&
      !Array.isArray(audit.qualityProfiles)
        ? (audit.qualityProfiles as Record<string, unknown>)
        : {};

    const snapshotTimingDiagnostics =
      snapshotBase.timingDiagnostics &&
      typeof snapshotBase.timingDiagnostics === 'object' &&
      !Array.isArray(snapshotBase.timingDiagnostics)
        ? (snapshotBase.timingDiagnostics as Record<string, unknown>)
        : {};

    const auditTimingDiagnostics =
      audit.timingDiagnostics &&
      typeof audit.timingDiagnostics === 'object' &&
      !Array.isArray(audit.timingDiagnostics)
        ? (audit.timingDiagnostics as Record<string, unknown>)
        : {};

    const merged = {
      ...snapshotBase,
      activeQualityProfile:
        snapshotBase.activeQualityProfile ??
        audit.activeQualityProfile ??
        snapshotQualityProfiles.active ??
        auditQualityProfiles.active ??
        snapshotBase.qualityProfile ??
        snapshotQualityProfiles.current ??
        audit.qualityProfile ??
        auditQualityProfiles.current ??
        'unknown',
      forcedQualityProfile:
        snapshotBase.forcedQualityProfile ??
        audit.forcedQualityProfile ??
        snapshotQualityProfiles.forced ??
        auditQualityProfiles.forced ??
        null,
      qualityProfileSource:
        snapshotBase.qualityProfileSource ??
        audit.qualityProfileSource ??
        snapshotQualityProfiles.source ??
        auditQualityProfiles.source ??
        'unknown',
      qualityProfileReason:
        snapshotBase.qualityProfileReason ??
        audit.qualityProfileReason ??
        snapshotQualityProfiles.reason ??
        auditQualityProfiles.reason ??
        null,
      dprBucket:
        snapshotBase.dprBucket ??
        audit.dprBucket ??
        snapshotQualityProfiles.dprBucket ??
        auditQualityProfiles.dprBucket ??
        'normal',
      deviceClass:
        snapshotBase.deviceClass ??
        audit.deviceClass ??
        snapshotQualityProfiles.deviceClass ??
        auditQualityProfiles.deviceClass ??
        'unknown',
      rendererArea:
        snapshotBase.rendererArea ??
        audit.rendererArea ??
        snapshotQualityProfiles.rendererArea ??
        auditQualityProfiles.rendererArea ??
        null,
      qualityProfiles: {
        ...auditQualityProfiles,
        ...snapshotQualityProfiles,
        current:
          snapshotQualityProfiles.current ??
          auditQualityProfiles.current ??
          snapshotBase.qualityProfile ??
          audit.qualityProfile ??
          'unknown',
        active:
          snapshotQualityProfiles.active ??
          auditQualityProfiles.active ??
          snapshotBase.activeQualityProfile ??
          audit.activeQualityProfile ??
          snapshotQualityProfiles.current ??
          auditQualityProfiles.current ??
          snapshotBase.qualityProfile ??
          audit.qualityProfile ??
          'unknown',
        forced:
          snapshotQualityProfiles.forced ??
          auditQualityProfiles.forced ??
          snapshotBase.forcedQualityProfile ??
          audit.forcedQualityProfile ??
          null,
        source:
          snapshotQualityProfiles.source ??
          auditQualityProfiles.source ??
          snapshotBase.qualityProfileSource ??
          audit.qualityProfileSource ??
          'unknown',
        reason:
          snapshotQualityProfiles.reason ??
          auditQualityProfiles.reason ??
          snapshotBase.qualityProfileReason ??
          audit.qualityProfileReason ??
          null,
        estimatedCost:
          snapshotQualityProfiles.estimatedCost ??
          auditQualityProfiles.estimatedCost ??
          null,
        dprBucket:
          snapshotQualityProfiles.dprBucket ??
          auditQualityProfiles.dprBucket ??
          snapshotBase.dprBucket ??
          audit.dprBucket ??
          'normal',
        deviceClass:
          snapshotQualityProfiles.deviceClass ??
          auditQualityProfiles.deviceClass ??
          snapshotBase.deviceClass ??
          audit.deviceClass ??
          'unknown',
        rendererArea:
          snapshotQualityProfiles.rendererArea ??
          auditQualityProfiles.rendererArea ??
          snapshotBase.rendererArea ??
          audit.rendererArea ??
          null,
      },
      timingDiagnostics: {
        ...auditTimingDiagnostics,
        ...snapshotTimingDiagnostics,
        recentRebuilds: {
          ...(typeof auditTimingDiagnostics.recentRebuilds === 'object' &&
          auditTimingDiagnostics.recentRebuilds
            ? (auditTimingDiagnostics.recentRebuilds as Record<string, unknown>)
            : {}),
          ...(typeof snapshotTimingDiagnostics.recentRebuilds === 'object' &&
          snapshotTimingDiagnostics.recentRebuilds
            ? (snapshotTimingDiagnostics.recentRebuilds as Record<
                string,
                unknown
              >)
            : {}),
        },
      },
    };

    return JSON.parse(JSON.stringify(merged));
  });

  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') {
    throw new Error('snapshot() doit retourner un objet JSON sérialisable.');
  }

  return snapshot as Record<string, JsonValue>;
}

export function flattenScalarPaths(
  input: unknown,
  prefix = '',
): Array<{ path: string; value: JsonPrimitive }> {
  if (isScalar(input)) {
    return [{ path: prefix || '$', value: input }];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item, index) =>
      flattenScalarPaths(item, `${prefix}[${index}]`),
    );
  }

  if (isRecord(input)) {
    return Object.entries(input).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return flattenScalarPaths(value, path);
    });
  }

  return [];
}

export function matchMetrics(
  snapshot: Record<string, JsonValue>,
): MatchedMetric[] {
  const flat = flattenScalarPaths(snapshot);
  const matches: MatchedMetric[] = [];

  for (const [name, pattern] of Object.entries(METRIC_PATTERNS)) {
    const hit = flat.find((entry) => pattern.test(entry.path));
    if (hit) {
      matches.push({
        name,
        path: hit.path,
        value: hit.value,
      });
    }
  }

  return matches;
}

export function metricGroupNames(metrics: MatchedMetric[]): string[] {
  const groups = new Set<string>();

  for (const metric of metrics) {
    if (['drawCalls', 'triangles', 'visibleProbe'].includes(metric.name)) {
      groups.add('render');
    }

    if (
      ['avgLuma', 'nonBlackRatio', 'brightRatio', 'opacity'].includes(
        metric.name,
      )
    ) {
      groups.add('visual');
    }

    if (
      ['totalUpdateMs', 'fluidMs', 'geometryMs', 'volumeMs'].includes(
        metric.name,
      )
    ) {
      groups.add('timing');
    }
  }

  return [...groups];
}

export function buildSnapshotDiagnostics(snapshot: Record<string, JsonValue>) {
  const flat = flattenScalarPaths(snapshot);
  const metrics = matchMetrics(snapshot);
  const groups = metricGroupNames(metrics);

  return {
    rootKeys: Object.keys(snapshot),
    scalarPathsCount: flat.length,
    scalarPathsSample: flat.slice(0, 25).map((entry) => entry.path),
    metrics,
    groups,
  };
}

export function buildStructuralSummary(snapshot: Record<string, JsonValue>) {
  return {
    renderMode: getAtPath(snapshot, 'renderMode'),
    qualityProfile: getAtPath(snapshot, 'qualityProfile'),
    qualityProfileCurrent: getAtPath(snapshot, 'qualityProfiles.current'),
    drawCalls: getAtPath(snapshot, 'telemetry.drawCalls'),
    triangles: getAtPath(snapshot, 'telemetry.triangles'),
    dpr: getAtPath(snapshot, 'telemetry.dpr'),
    rendererSize: getAtPath(snapshot, 'telemetry.rendererSize'),
    totalUpdateMs: getAtPath(snapshot, 'orchestratorTimings.totalUpdateMs'),
    geometryMs: getAtPath(snapshot, 'orchestratorTimings.geometryMs'),
    fluidMs: getAtPath(snapshot, 'orchestratorTimings.fluidMs'),
    volumeMs: getAtPath(snapshot, 'orchestratorTimings.volumeMs'),
    canvasAttached: getAtPath(snapshot, 'dom.canvasAttached'),
    canvasClient: getAtPath(snapshot, 'dom.canvasClient'),
    canvasWidth: getAtPath(snapshot, 'dom.canvasWidth'),
    canvasHeight: getAtPath(snapshot, 'dom.canvasHeight'),
    warningsCount: Array.isArray(getAtPath(snapshot, 'warnings'))
      ? (getAtPath(snapshot, 'warnings') as unknown[]).length
      : null,
    feedbackCandidatesCount: Array.isArray(
      getAtPath(snapshot, 'feedbackCandidates'),
    )
      ? (getAtPath(snapshot, 'feedbackCandidates') as unknown[]).length
      : null,
  };
}

export function assertStructuralSmoke(
  snapshot: Record<string, JsonValue>,
  options: StructuralSmokeOptions,
): void {
  const diagnostics = buildSnapshotDiagnostics(snapshot);

  expect(
    diagnostics.rootKeys.length,
    'Le snapshot doit contenir au moins une clé racine.',
  ).toBeGreaterThan(0);

  expect(
    diagnostics.scalarPathsCount,
    'Le snapshot doit exposer plusieurs scalaires exploitables.',
  ).toBeGreaterThanOrEqual(8);

  expect(
    diagnostics.metrics.length,
    'Le snapshot doit exposer au moins 3 métriques reconnues.',
  ).toBeGreaterThanOrEqual(3);

  expect(
    diagnostics.groups.length,
    'Le snapshot doit couvrir au moins 2 groupes de métriques (render / visual / timing).',
  ).toBeGreaterThanOrEqual(2);

  const requiredRootKeys = [
    'time',
    'seed',
    'renderMode',
    'orchestratorTimings',
    'rendererInfo',
    'telemetry',
    'sceneStats',
    'dom',
    'uiWindow',
    'warnings',
  ];

  for (const key of requiredRootKeys) {
    expect(
      diagnostics.rootKeys.includes(key),
      `La clé racine ${key} doit être présente.`,
    ).toBe(true);
  }

  const time = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'time',
    'snapshot.time doit être un timestamp numérique.',
  );
  expect(time).toBeGreaterThan(0);

  const seed = expectStringAtPath(
    snapshot,
    'seed',
    'snapshot.seed doit être une chaîne non vide.',
  );
  expect(seed.trim().length).toBeGreaterThan(0);

  const renderMode = expectStringAtPath(
    snapshot,
    'renderMode',
    'snapshot.renderMode doit être une chaîne.',
  );
  expect(renderMode.trim().length).toBeGreaterThan(0);

  const warnings = expectArrayAtPath(
    snapshot,
    'warnings',
    'snapshot.warnings doit être un tableau.',
  );
  expect(warnings.length).toBeGreaterThanOrEqual(0);

  expectBooleanAtPath(
    snapshot,
    'dom.canvasAttached',
    'dom.canvasAttached doit être booléen.',
  );
  expectBooleanAtPath(
    snapshot,
    'sceneStats.hasRenderableContent',
    'sceneStats.hasRenderableContent doit être booléen.',
  );

  const canvasAttached = expectBooleanAtPath(snapshot, 'dom.canvasAttached');
  expect(canvasAttached, 'Le canvas doit être attaché au DOM.').toBe(true);

  const hasRenderableContent = expectBooleanAtPath(
    snapshot,
    'sceneStats.hasRenderableContent',
  );
  expect(hasRenderableContent, 'La scène doit déclarer du contenu rendu.').toBe(
    true,
  );

  const rendererMode = expectStringAtPath(snapshot, 'rendererInfo.mode');
  const uiWindowRenderMode = expectStringAtPath(
    snapshot,
    'uiWindow.renderMode',
  );

  expect(
    rendererMode,
    'rendererInfo.mode doit être cohérent avec renderMode.',
  ).toBe(renderMode);
  expect(
    uiWindowRenderMode,
    'uiWindow.renderMode doit être cohérent avec renderMode.',
  ).toBe(renderMode);

  const drawCallsTelemetry = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'telemetry.drawCalls',
  );
  const drawCallsRenderer = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'rendererInfo.total.calls',
  );

  const trianglesTelemetry = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'telemetry.triangles',
  );
  const trianglesRenderer = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'rendererInfo.total.triangles',
  );

  expect(
    drawCallsTelemetry,
    'telemetry.drawCalls doit être cohérent avec rendererInfo.total.calls.',
  ).toBe(drawCallsRenderer);

  expect(
    trianglesTelemetry,
    'telemetry.triangles doit être cohérent avec rendererInfo.total.triangles.',
  ).toBe(trianglesRenderer);

  expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'orchestratorTimings.totalUpdateMs',
  );
  expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'orchestratorTimings.geometryMs',
  );
  expectNonNegativeFiniteNumberAtPath(snapshot, 'orchestratorTimings.fluidMs');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'orchestratorTimings.volumeMs');

  expectNonNegativeFiniteNumberAtPath(snapshot, 'telemetry.dpr');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'telemetry.rendererSize.w');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'telemetry.rendererSize.h');

  expectNonNegativeFiniteNumberAtPath(snapshot, 'dom.canvasClient.width');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'dom.canvasClient.height');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'dom.canvasWidth');
  expectNonNegativeFiniteNumberAtPath(snapshot, 'dom.canvasHeight');

  const qualityProfile = expectStringAtPath(snapshot, 'qualityProfile');
  const qualityProfileCurrent = expectStringAtPath(
    snapshot,
    'qualityProfiles.current',
  );

  expect(
    qualityProfileCurrent,
    'qualityProfiles.current doit être cohérent avec qualityProfile.',
  ).toBe(qualityProfile);

  const canvasClientWidth = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'dom.canvasClient.width',
  );
  const canvasClientHeight = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'dom.canvasClient.height',
  );
  const canvasWidth = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'dom.canvasWidth',
  );
  const canvasHeight = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'dom.canvasHeight',
  );

  expect(canvasClientWidth).toBeGreaterThan(0);
  expect(canvasClientHeight).toBeGreaterThan(0);
  expect(canvasWidth).toBeGreaterThanOrEqual(canvasClientWidth);
  expect(canvasHeight).toBeGreaterThanOrEqual(canvasClientHeight);

  const framesRendered = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'rendererInfo.framesRendered',
  );
  expect(framesRendered).toBeGreaterThanOrEqual(1);

  const resetCount = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'counters.reset',
  );
  const reinitCount = expectNonNegativeFiniteNumberAtPath(
    snapshot,
    'counters.reinit',
  );
  expect(resetCount).toBeGreaterThanOrEqual(0);
  expect(reinitCount).toBeGreaterThanOrEqual(0);

  const feedbackCandidates = expectArrayAtPath(snapshot, 'feedbackCandidates');
  expect(feedbackCandidates.length).toBeGreaterThanOrEqual(0);

  if (options.deviceKind === 'mobile') {
    const dpr = expectNonNegativeFiniteNumberAtPath(snapshot, 'telemetry.dpr');
    expect(
      dpr,
      'En mobile, le DPR doit rester exploitable.',
    ).toBeGreaterThanOrEqual(1);

    const rootWidth = expectNonNegativeFiniteNumberAtPath(
      snapshot,
      'dom.rootRect.width',
    );
    const rootHeight = expectNonNegativeFiniteNumberAtPath(
      snapshot,
      'dom.rootRect.height',
    );
    expect(rootWidth).toBeGreaterThan(0);
    expect(rootHeight).toBeGreaterThan(0);
  }

  if (options.deviceKind === 'desktop') {
    const rootWidth = expectNonNegativeFiniteNumberAtPath(
      snapshot,
      'dom.rootRect.width',
    );
    const rootHeight = expectNonNegativeFiniteNumberAtPath(
      snapshot,
      'dom.rootRect.height',
    );
    expect(rootWidth).toBeGreaterThan(0);
    expect(rootHeight).toBeGreaterThan(0);
  }

  for (const metric of diagnostics.metrics) {
    if (typeof metric.value === 'number') {
      expect(
        Number.isFinite(metric.value),
        `La métrique ${metric.name} (${metric.path}) doit être un nombre fini.`,
      ).toBe(true);
    }
  }
}
