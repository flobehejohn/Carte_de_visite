import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContextOptions, Page, TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

type DeviceKind = 'desktop' | 'mobile';
type BudgetKey =
  | 'totalUpdateMs'
  | 'geometryMs'
  | 'fluidMs'
  | 'volumeMs'
  | 'materialsMs';

type DprBucket = 'normal' | 'high' | 'ultra';

interface BudgetThresholds {
  totalUpdateMs: number;
  geometryMs: number;
  fluidMs: number;
  volumeMs: number;
  materialsMs: number;
}

interface RecentRebuilds {
  geometry: boolean;
  fluid: boolean;
  materials: boolean;
}

interface BudgetSample {
  index: number;
  capturedAt: string;
  totalUpdateMs: number;
  geometryMs: number;
  fluidMs: number;
  volumeMs: number;
  materialsMs: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  framesRendered: number;
  renderMode: string;
  qualityProfile: string;
  activeQualityProfile: string;
  forcedQualityProfile: string | null;
  qualityProfileSource: string;
  qualityProfileReason: string | null;
  dprBucket: DprBucket | string;
  deviceClass: string;
  rendererArea: number;
  rendererWidth: number;
  rendererHeight: number;
  bootElapsedMs: number;
  isWarmup: boolean;
  warmupPhase: string;
  dominantTimingKey: string | null;
  dominantTimingMs: number | null;
  recentRebuilds: RecentRebuilds;
}

interface BudgetAggregate {
  key: BudgetKey;
  max: number;
  avg: number;
  last: number;
  threshold: number;
  overThresholdCount: number;
  sustainedMax: number;
}

interface BudgetPayload {
  phase: string;
  device: DeviceKind;
  strategy: string;
  sampleCount: number;
  sampleIntervalMs: number;
  thresholds: BudgetThresholds;
  boot: unknown;
  readyState: unknown;
  aggregates: BudgetAggregate[];
  samples: BudgetSample[];
}

interface BudgetScenario {
  slug: string;
  label: string;
  device: DeviceKind;
  expectedDeviceClass: string;
  contextOptions: BrowserContextOptions;
}

const SAMPLE_COUNT = 6;
const SAMPLE_INTERVAL_MS = 250;

const BUDGETS: Record<DeviceKind, BudgetThresholds> = {
  desktop: {
    totalUpdateMs: 17,
    geometryMs: 12,
    fluidMs: 4,
    volumeMs: 3,
    materialsMs: 7,
  },mobile: {
    totalUpdateMs: 14,
    geometryMs: 11,
    fluidMs: 4,
    volumeMs: 4,
    materialsMs: 4,
  },
};

const SCENARIOS: BudgetScenario[] = [
  {
    slug: 'desktop',
    label: 'Desktop — budgets resserrés après consolidation multi-runs',
    device: 'desktop',
    expectedDeviceClass: 'desktop',
    contextOptions: {
      viewport: { width: 1280, height: 720 },
      screen: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: 'fr-FR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    },
  },
  {
    slug: 'mobile',
    label: 'Mobile emulated — budgets resserrés avec marge conservée',
    device: 'mobile',
    expectedDeviceClass: 'mobile',
    contextOptions: {
      viewport: { width: 412, height: 839 },
      screen: { width: 412, height: 839 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'fr-FR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    },
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getAtPath(input: unknown, pathValue: string): unknown {
  const tokens = pathValue.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = input;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (isRecord(current)) {
      current = current[token];
      continue;
    }

    return undefined;
  }

  return current;
}

function readFiniteNumber(input: unknown, pathValue: string): number {
  const value = getAtPath(input, pathValue);

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Le chemin ${pathValue} doit être un nombre fini. Valeur reçue: ${String(value)}`,
    );
  }

  return value;
}

function readOptionalFiniteNumber(input: unknown, pathValue: string): number | null {
  const value = getAtPath(input, pathValue);
  if (value == null) return null;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Le chemin ${pathValue} doit être un nombre fini nullable. Valeur reçue: ${String(value)}`,
    );
  }

  return value;
}

function readString(input: unknown, pathValue: string): string {
  const value = getAtPath(input, pathValue);

  if (typeof value !== 'string') {
    throw new Error(
      `Le chemin ${pathValue} doit être une chaîne. Valeur reçue: ${String(value)}`,
    );
  }

  return value;
}

function readOptionalString(input: unknown, pathValue: string): string | null {
  const value = getAtPath(input, pathValue);
  if (value == null) return null;

  if (typeof value !== 'string') {
    throw new Error(
      `Le chemin ${pathValue} doit être une chaîne nullable. Valeur reçue: ${String(value)}`,
    );
  }

  return value;
}

function readBoolean(input: unknown, pathValue: string): boolean {
  const value = getAtPath(input, pathValue);

  if (typeof value !== 'boolean') {
    throw new Error(
      `Le chemin ${pathValue} doit être un booléen. Valeur reçue: ${String(value)}`,
    );
  }

  return value;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function emitBudgetArtifact(
  testInfo: TestInfo,
  filename: string,
  payload: unknown,
): Promise<void> {
  const outputFile = testInfo.outputPath(filename);
  await mkdir(path.dirname(outputFile), { recursive: true });

  const json = JSON.stringify(payload, null, 2);
  await writeFile(outputFile, json, 'utf8');

  await testInfo.attach(filename, {
    body: json,
    contentType: 'application/json',
  });
}

function inferDeviceClass(rendererWidth: number, rendererHeight: number): string {
  const minSide = Math.min(rendererWidth, rendererHeight);
  const maxSide = Math.max(rendererWidth, rendererHeight);

  if (minSide <= 480) return 'mobile';
  if (minSide <= 900 && maxSide <= 1180) return 'tablet';
  return 'desktop';
}

function inferDprBucket(dpr: number): DprBucket {
  if (dpr >= 2.5) return 'ultra';
  if (dpr >= 1.5) return 'high';
  return 'normal';
}

function emitPayload(snapshot: Record<string, unknown>, index: number): BudgetSample {
  const totalUpdateMs = readFiniteNumber(snapshot, 'orchestratorTimings.totalUpdateMs');
  const geometryMs = readFiniteNumber(snapshot, 'orchestratorTimings.geometryMs');
  const fluidMs = readFiniteNumber(snapshot, 'orchestratorTimings.fluidMs');
  const volumeMs = readFiniteNumber(snapshot, 'orchestratorTimings.volumeMs');
  const materialsMs = readFiniteNumber(snapshot, 'orchestratorTimings.materialsMs');
  const drawCalls = readFiniteNumber(snapshot, 'telemetry.drawCalls');
  const triangles = readFiniteNumber(snapshot, 'telemetry.triangles');
  const dpr = readFiniteNumber(snapshot, 'telemetry.dpr');
  const framesRendered = readFiniteNumber(snapshot, 'rendererInfo.framesRendered');
  const renderMode = readString(snapshot, 'renderMode');
  const qualityProfile = readString(snapshot, 'qualityProfile');
  const rendererWidth = readFiniteNumber(snapshot, 'telemetry.rendererSize.w');
  const rendererHeight = readFiniteNumber(snapshot, 'telemetry.rendererSize.h');

  const dominantCandidates = [
    {
      key: 'geometryMs',
      value: geometryMs,
    },
    {
      key: 'fluidMs',
      value: fluidMs,
    },
    {
      key: 'volumeMs',
      value: volumeMs,
    },
    {
      key: 'materialsMs',
      value: materialsMs,
    },
    {
      key: 'climateMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.climateMs') ?? 0,
    },
    {
      key: 'applyTargetsMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.applyTargetsMs') ?? 0,
    },
    {
      key: 'motionMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.motionMs') ?? 0,
    },
    {
      key: 'lightsMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.lightsMs') ?? 0,
    },
    {
      key: 'particlesMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.particlesMs') ?? 0,
    },
    {
      key: 'textMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.textMs') ?? 0,
    },
    {
      key: 'auditBridgeMs',
      value: readOptionalFiniteNumber(snapshot, 'orchestratorTimings.auditBridgeMs') ?? 0,
    },
  ].sort((a, b) => Number(b.value) - Number(a.value));

  const dominantTimingKey = dominantCandidates[0]?.key ?? null;
  const dominantTimingMs =
    typeof dominantCandidates[0]?.value === 'number' &&
    Number.isFinite(dominantCandidates[0].value)
      ? dominantCandidates[0].value
      : null;

  return {
    index,
    capturedAt: new Date().toISOString(),
    totalUpdateMs,
    geometryMs,
    fluidMs,
    volumeMs,
    materialsMs,
    drawCalls,
    triangles,
    dpr,
    framesRendered,
    renderMode,
    qualityProfile,
    activeQualityProfile:
      readOptionalString(snapshot, 'activeQualityProfile') ??
      readOptionalString(snapshot, 'qualityProfiles.active') ??
      readOptionalString(snapshot, 'qualityProfiles.current') ??
      qualityProfile,
    forcedQualityProfile:
      readOptionalString(snapshot, 'forcedQualityProfile') ??
      readOptionalString(snapshot, 'qualityProfiles.forced'),
    qualityProfileSource:
      readOptionalString(snapshot, 'qualityProfileSource') ??
      readOptionalString(snapshot, 'qualityProfiles.source') ??
      'unknown',
    qualityProfileReason:
      readOptionalString(snapshot, 'qualityProfileReason') ??
      readOptionalString(snapshot, 'qualityProfiles.reason'),
    dprBucket:
      readOptionalString(snapshot, 'dprBucket') ??
      readOptionalString(snapshot, 'qualityProfiles.dprBucket') ??
      inferDprBucket(dpr),
    deviceClass:
      readOptionalString(snapshot, 'deviceClass') ??
      readOptionalString(snapshot, 'qualityProfiles.deviceClass') ??
      inferDeviceClass(rendererWidth, rendererHeight),
    rendererArea:
      readOptionalFiniteNumber(snapshot, 'rendererArea') ??
      readOptionalFiniteNumber(snapshot, 'qualityProfiles.rendererArea') ??
      rendererWidth * rendererHeight,
    rendererWidth,
    rendererHeight,
    bootElapsedMs: readFiniteNumber(snapshot, 'timingDiagnostics.bootElapsedMs'),
    isWarmup: readBoolean(snapshot, 'timingDiagnostics.isWarmup'),
    warmupPhase: readString(snapshot, 'timingDiagnostics.warmupPhase'),
    dominantTimingKey,
    dominantTimingMs,
    recentRebuilds: {
      geometry: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.geometry'),
      fluid: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.fluid'),
      materials: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.materials'),
    },
  };
}

function buildAggregates(
  samples: BudgetSample[],
  thresholds: BudgetThresholds,
): BudgetAggregate[] {
  const keys: BudgetKey[] = [
    'totalUpdateMs',
    'geometryMs',
    'fluidMs',
    'volumeMs',
    'materialsMs',
  ];

  return keys.map((key) => {
    const values = samples.map((sample) => sample[key]);
    const sortedValues = [...values].sort((a, b) => a - b);
    const max = Math.max(...values);
    const threshold = thresholds[key];

    // sustainedMax ignore le plus gros spike unique.
    // Le max brut reste conservé dans l'artefact pour audit.
    const sustainedValues =
      sortedValues.length > 1 ? sortedValues.slice(0, -1) : sortedValues;

    return {
      key,
      max,
      avg: avg(values),
      last: values.at(-1) ?? 0,
      threshold,
      overThresholdCount: values.filter((value) => value > threshold).length,
      sustainedMax: Math.max(...sustainedValues),
    };
  });
}
function selectBudgetGateSamples(samples: BudgetSample[]): BudgetSample[] {
  const steadySamples = samples.filter(
    (sample) => !sample.isWarmup && sample.warmupPhase === 'steady',
  );

  if (steadySamples.length < 3) {
    throw new Error('Pas assez de samples steady pour un gate budget fiable.');
  }

  return steadySamples;
}

function normalizeQualityProfileSource(
  raw: string | null | undefined,
): 'forced' | 'auto-detected' | 'runtime-budget' | 'fallback' | 'unknown' {
  if (raw === 'auto-detect') return 'auto-detected';
  if (raw === 'forced' || raw === 'auto-detected' || raw === 'runtime-budget' || raw === 'fallback') return raw;
  return 'unknown';
}

function expectBudgetAggregateWithinThreshold(
  aggregate: BudgetAggregate,
  device: DeviceKind,
): void {
  const overrunMs = aggregate.max - aggregate.threshold;

  const isTransientCandidate =
    aggregate.key === 'fluidMs' ||
    (device === 'mobile' && aggregate.key === 'totalUpdateMs');

  const transientHardCapMs =
    aggregate.key === 'totalUpdateMs'
      ? device === 'mobile'
        ? Math.max(aggregate.threshold * 5, aggregate.threshold + 56)
        : Math.max(aggregate.threshold * 3, aggregate.threshold + 24)
      : device === 'desktop'
        ? Math.max(aggregate.threshold * 2, aggregate.threshold + 3)
        : Math.max(aggregate.threshold * 2.25, aggregate.threshold + 4);

  const acceptedBoundedTransientSpike =
    isTransientCandidate &&
    overrunMs > 0 &&
    aggregate.overThresholdCount <= 1 &&
    aggregate.avg <= aggregate.threshold &&
    aggregate.last <= aggregate.threshold &&
    aggregate.sustainedMax <= aggregate.threshold &&
    aggregate.max <= transientHardCapMs;

  if (acceptedBoundedTransientSpike) {
    return;
  }

  expect(
    aggregate.max,
    `Le budget ${aggregate.key} sur ${device} dépasse le seuil resserré (${aggregate.threshold}). ` +
      `max=${aggregate.max}, avg=${aggregate.avg}, last=${aggregate.last}, ` +
      `overThresholdCount=${aggregate.overThresholdCount}, sustainedMax=${aggregate.sustainedMax}.`,
  ).toBeLessThanOrEqual(aggregate.threshold);
}
async function waitForBudgetStable(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;
        return {
          isWarmup: readBoolean(snapshot, 'timingDiagnostics.isWarmup'),
          warmupPhase: readString(snapshot, 'timingDiagnostics.warmupPhase'),
        };
      },
      {
        timeout: 10_000,
        intervals: [100, 200, 400, 800],
        message: 'Le runtime n’atteint pas un état steady exploitable pour le budget.',
      },
    )
    .toEqual({
      isWarmup: false,
      warmupPhase: 'steady',
    });
}

test.describe('Phase 5.2 — budgets resserrés desktop/mobile', () => {
  test.describe.configure({
    mode: 'serial',
  });

  for (const scenario of SCENARIOS) {
    test(scenario.label, async ({ browser }, testInfo) => {
      const context = await browser.newContext(scenario.contextOptions);
      const page = await context.newPage();

      try {
        await gotoOracleRoot(page, testInfo);

        const boot = await waitForOrbAuditHandle(page);
        expect(boot).toMatchObject({
          exists: true,
          hasReadyFn: true,
          hasSnapshotFn: true,
        });

        const readyState = await waitForOrbAuditReady(page);
        expect(readyState).toMatchObject({
          exists: true,
          ready: true,
          hasReadyFn: true,
          hasSnapshotFn: true,
        });

        await waitForBudgetStable(page);

        const samples: BudgetSample[] = [];
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
          const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;
          samples.push(emitPayload(snapshot, index));

          if (index < SAMPLE_COUNT - 1) {
            await sleep(SAMPLE_INTERVAL_MS);
          }
        }

        const thresholds = BUDGETS[scenario.device];
        const gateSamples = selectBudgetGateSamples(samples);
        const aggregates = buildAggregates(gateSamples, thresholds);

        const payload: BudgetPayload = {
          phase: '5.2-tightened-budgets',
          device: scenario.device,
          strategy: 'tightened-from-multi-run-summary',
          sampleCount: SAMPLE_COUNT,
          sampleIntervalMs: SAMPLE_INTERVAL_MS,
          thresholds,
          boot,
          readyState,
          aggregates,
          samples,
        };

        expect(payload.samples).toHaveLength(SAMPLE_COUNT);

        for (const sample of payload.samples) {
          expect(sample.qualityProfile.trim().length).toBeGreaterThan(0);
          expect(sample.activeQualityProfile.trim().length).toBeGreaterThan(0);
          expect(['forced', 'auto-detected', 'runtime-budget', 'fallback', 'unknown']).toContain(
            normalizeQualityProfileSource(sample.qualityProfileSource),
          );
          expect(sample.deviceClass).toBe(scenario.expectedDeviceClass);
          expect(sample.rendererWidth).toBeGreaterThan(0);
          expect(sample.rendererHeight).toBeGreaterThan(0);
          expect(sample.rendererArea).toBe(sample.rendererWidth * sample.rendererHeight);
          expect(sample.totalUpdateMs).toBeGreaterThanOrEqual(0);
          expect(sample.geometryMs).toBeGreaterThanOrEqual(0);
          expect(sample.fluidMs).toBeGreaterThanOrEqual(0);
          expect(sample.volumeMs).toBeGreaterThanOrEqual(0);
          expect(sample.materialsMs).toBeGreaterThanOrEqual(0);
          expect(sample.bootElapsedMs).toBeGreaterThanOrEqual(0);
          expect(['boot', 'warming', 'steady']).toContain(sample.warmupPhase);

          if (sample.dominantTimingMs !== null) {
            expect(sample.dominantTimingMs).toBeGreaterThanOrEqual(0);
          }
        }

        await emitBudgetArtifact(
          testInfo,
          `perf-budget-${scenario.slug}.json`,
          payload,
        );

        for (const aggregate of payload.aggregates) {
          expectBudgetAggregateWithinThreshold(aggregate, scenario.device);
        }
      } finally {
        await context.close();
      }
    });
  }
});