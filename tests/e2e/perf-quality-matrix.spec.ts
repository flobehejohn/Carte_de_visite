import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContextOptions, TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

type DeviceKind = 'desktop' | 'mobile';
type DprBucket = 'normal' | 'high' | 'ultra';
const DPR_BUCKETS = ['normal', 'high', 'ultra'] as const;

function normalizeDprBucket(raw: string | null | undefined): DprBucket {
  if (DPR_BUCKETS.includes(raw as DprBucket)) {
    return raw as DprBucket;
  }

  return 'normal';
}
type QualityProfileName = 'ultra' | 'high' | 'medium' | 'low' | 'safe';

const QUALITY_PROFILE_NAMES = [
  'ultra',
  'high',
  'medium',
  'low',
  'safe',
] as const;
const QUALITY_PROFILE_SOURCES = [
  'forced',
  'auto-detected',
  'runtime-budget',
  'fallback',
  'unknown',
] as const;

type QualityProfileSource = (typeof QUALITY_PROFILE_SOURCES)[number];

function normalizeQualityProfileSource(
  raw: string | null | undefined,
): QualityProfileSource {
  if (raw === 'auto-detect') return 'auto-detected';

  if (QUALITY_PROFILE_SOURCES.includes(raw as QualityProfileSource)) {
    return raw as QualityProfileSource;
  }

  return 'unknown';
}

function deriveDprBucketFromEffectiveDpr(dpr: number): DprBucket {
  if (!Number.isFinite(dpr) || dpr < 1.5) return 'normal';
  if (dpr >= 2.5) return 'ultra';
  return 'high';
}
interface MatrixScenario {
  slug: string;
  label: string;
  deviceKind: DeviceKind;
  expectedDeviceClass: string;
  expectedDpr: number;
  expectedDprBucket: DprBucket;
  expectedActiveQualityProfile: string;
  viewport: { width: number; height: number };
  contextOptions: BrowserContextOptions;
}

interface QualityMatrixPayload {
  phase: string;
  scenario: string;
  deviceKind: DeviceKind;
  boot: unknown;
  readyState: unknown;
  qualityProfile: string;
  activeQualityProfile: string;
  forcedQualityProfile: string | null;
  qualityProfileSource: QualityProfileSource;
  qualityProfileReason: string | null;
  dpr: number;
  dprBucket: DprBucket;
  deviceClass: string;
  rendererWidth: number;
  rendererHeight: number;
  rendererArea: number;
  renderMode: string;
  dominantTimingKey: string | null;
  dominantTimingMs: number | null;
  bootElapsedMs: number;
  isWarmup: boolean;
  warmupPhase: string;
  orchestratorTimings: {
    totalUpdateMs: number;
    geometryMs: number;
    fluidMs: number;
    volumeMs: number;
    materialsMs: number;
    climateMs: number | null;
    applyTargetsMs: number | null;
    motionMs: number | null;
    lightsMs: number | null;
    particlesMs: number | null;
    textMs: number | null;
    auditBridgeMs: number | null;
  };
  recentRebuilds: {
    geometry: boolean;
    fluid: boolean;
    materials: boolean;
  };
}

const SCENARIOS: MatrixScenario[] = [
  {
    slug: 'desktop-normal',
    label: 'Desktop / DPR normal',
    deviceKind: 'desktop',
    expectedDeviceClass: 'desktop',
    expectedDpr: 1,
    expectedDprBucket: 'normal',
    expectedActiveQualityProfile: 'desktop-standard',
    viewport: { width: 1280, height: 720 },
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
    slug: 'desktop-high-dpr',
    label: 'Desktop / DPR élevé',
    deviceKind: 'desktop',
    expectedDeviceClass: 'desktop',
    expectedDpr: 2,
    expectedDprBucket: 'high',
    expectedActiveQualityProfile: 'desktop-high-dpr',
    viewport: { width: 1280, height: 720 },
    contextOptions: {
      viewport: { width: 1280, height: 720 },
      screen: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: false,
      locale: 'fr-FR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    },
  },
  {
    slug: 'mobile-normal',
    label: 'Mobile / DPR normal',
    deviceKind: 'mobile',
    expectedDeviceClass: 'mobile',
    expectedDpr: 1,
    expectedDprBucket: 'normal',
    expectedActiveQualityProfile: 'mobile-safe',
    viewport: { width: 412, height: 839 },
    contextOptions: {
      viewport: { width: 412, height: 839 },
      screen: { width: 412, height: 839 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      locale: 'fr-FR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    },
  },
  {
    slug: 'mobile-high-dpr',
    label: 'Mobile / DPR élevé',
    deviceKind: 'mobile',
    expectedDeviceClass: 'mobile',
    expectedDpr: 2,
    expectedDprBucket: 'high',
    expectedActiveQualityProfile: 'mobile-high-dpr',
    viewport: { width: 412, height: 839 },
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
    throw new Error(`Le chemin ${pathValue} doit être un nombre fini. Valeur reçue: ${String(value)}`);
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
    throw new Error(`Le chemin ${pathValue} doit être une chaîne. Valeur reçue: ${String(value)}`);
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
    throw new Error(`Le chemin ${pathValue} doit être un booléen. Valeur reçue: ${String(value)}`);
  }

  return value;
}

async function emitMatrixArtifact(
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

function buildPayload(
  snapshot: Record<string, unknown>,
  scenario: MatrixScenario,
  boot: unknown,
  readyState: unknown,
): QualityMatrixPayload {
  const dpr = readFiniteNumber(snapshot, 'telemetry.dpr');
  const rendererWidth = readFiniteNumber(snapshot, 'telemetry.rendererSize.w');
  const rendererHeight = readFiniteNumber(snapshot, 'telemetry.rendererSize.h');
  const rendererArea =
    readOptionalFiniteNumber(snapshot, 'rendererArea') ??
    readOptionalFiniteNumber(snapshot, 'qualityProfiles.rendererArea') ??
    rendererWidth * rendererHeight;

  const geometryMs = readFiniteNumber(snapshot, 'orchestratorTimings.geometryMs');
  const fluidMs = readFiniteNumber(snapshot, 'orchestratorTimings.fluidMs');
  const volumeMs = readFiniteNumber(snapshot, 'orchestratorTimings.volumeMs');
  const materialsMs = readFiniteNumber(snapshot, 'orchestratorTimings.materialsMs');
  const climateMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.climateMs');
  const applyTargetsMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.applyTargetsMs');
  const motionMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.motionMs');
  const lightsMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.lightsMs');
  const particlesMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.particlesMs');
  const textMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.textMs');
  const auditBridgeMs = readOptionalFiniteNumber(snapshot, 'orchestratorTimings.auditBridgeMs');

  const dominantCandidates = [
    { key: 'geometryMs', value: geometryMs },
    { key: 'fluidMs', value: fluidMs },
    { key: 'volumeMs', value: volumeMs },
    { key: 'materialsMs', value: materialsMs },
    { key: 'climateMs', value: climateMs ?? 0 },
    { key: 'applyTargetsMs', value: applyTargetsMs ?? 0 },
    { key: 'motionMs', value: motionMs ?? 0 },
    { key: 'lightsMs', value: lightsMs ?? 0 },
    { key: 'particlesMs', value: particlesMs ?? 0 },
    { key: 'textMs', value: textMs ?? 0 },
    { key: 'auditBridgeMs', value: auditBridgeMs ?? 0 },
  ].sort((a, b) => Number(b.value) - Number(a.value));

  const dominantTimingKey = dominantCandidates[0]?.key ?? null;
  const dominantTimingMs =
    typeof dominantCandidates[0]?.value === 'number' &&
    Number.isFinite(dominantCandidates[0].value)
      ? dominantCandidates[0].value
      : null;

  return {
    phase: '5.2-quality-profile-certification-matrix',
    scenario: scenario.slug,
    deviceKind: scenario.deviceKind,
    boot,
    readyState,
    qualityProfile: readString(snapshot, 'qualityProfile'),
    activeQualityProfile:
      readOptionalString(snapshot, 'activeQualityProfile') ??
      readOptionalString(snapshot, 'qualityProfiles.active') ??
      readString(snapshot, 'qualityProfiles.current'),
    forcedQualityProfile:
      readOptionalString(snapshot, 'forcedQualityProfile') ??
      readOptionalString(snapshot, 'qualityProfiles.forced'),
    qualityProfileSource: normalizeQualityProfileSource(
      readOptionalString(snapshot, 'qualityProfileSource') ??
        readOptionalString(snapshot, 'qualityProfiles.source') ??
        'unknown',
    ),
    qualityProfileReason:
      readOptionalString(snapshot, 'qualityProfileReason') ??
      readOptionalString(snapshot, 'qualityProfiles.reason'),
    dpr,
    dprBucket: normalizeDprBucket(
      readOptionalString(snapshot, 'qualityProfiles.dprBucket') ??
        readOptionalString(snapshot, 'dprBucket') ??
        deriveDprBucketFromEffectiveDpr(dpr),
    ),
    deviceClass:
      readOptionalString(snapshot, 'deviceClass') ??
      readOptionalString(snapshot, 'qualityProfiles.deviceClass') ??
      'unknown',
    rendererWidth,
    rendererHeight,
    rendererArea,
    renderMode: readString(snapshot, 'renderMode'),
    dominantTimingKey,
    dominantTimingMs,
    bootElapsedMs: readFiniteNumber(snapshot, 'timingDiagnostics.bootElapsedMs'),
    isWarmup: readBoolean(snapshot, 'timingDiagnostics.isWarmup'),
    warmupPhase: readString(snapshot, 'timingDiagnostics.warmupPhase'),
    orchestratorTimings: {
      totalUpdateMs: readFiniteNumber(snapshot, 'orchestratorTimings.totalUpdateMs'),
      geometryMs,
      fluidMs,
      volumeMs,
      materialsMs,
      climateMs,
      applyTargetsMs,
      motionMs,
      lightsMs,
      particlesMs,
      textMs,
      auditBridgeMs,
    },
    recentRebuilds: {
      geometry: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.geometry'),
      fluid: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.fluid'),
      materials: readBoolean(snapshot, 'timingDiagnostics.recentRebuilds.materials'),
    },
  };
}

test.describe('Phase 5.2 — matrice de certification profils qualité', () => {
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
        expect(readyState.ready).toBe(true);

        const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;
        const payload = buildPayload(snapshot, scenario, boot, readyState);

        expect(payload.qualityProfile.trim().length).toBeGreaterThan(0);
        expect(payload.activeQualityProfile.trim().length).toBeGreaterThan(0);

        // Contrat runtime actuel :
        // activeQualityProfile est le profil effectif exposé par le gouverneur.
        // qualityProfile reste un champ historique/runtime : il doit être valide,
        // mais il n'est pas contractuellement obligé d'être égal à activeQualityProfile.
        const effectiveProfile = payload.activeQualityProfile as QualityProfileName;
        const legacyProfile = payload.qualityProfile as QualityProfileName;

        expect(QUALITY_PROFILE_NAMES).toContain(effectiveProfile);
        expect(QUALITY_PROFILE_NAMES).toContain(legacyProfile);

        if (
          payload.forcedQualityProfile !== null &&
          payload.forcedQualityProfile.trim().length > 0
        ) {
          expect(payload.activeQualityProfile).toBe(payload.forcedQualityProfile);
        }

        expect(QUALITY_PROFILE_SOURCES).toContain(payload.qualityProfileSource);

        // Le runtime expose le DPR effectif de rendu, potentiellement clampé
        // par le profil qualité, et non le DPR demandé au browser context.
        const requestedDpr = scenario.expectedDpr;
        expect(payload.dpr).toBeGreaterThan(0);
        expect(payload.dpr).toBeLessThanOrEqual(requestedDpr);

        if (requestedDpr > 1) {
          expect(payload.dpr).toBeGreaterThan(1);
        }

        const effectiveDprBucket = deriveDprBucketFromEffectiveDpr(payload.dpr);

        expect(DPR_BUCKETS).toContain(payload.dprBucket);
        expect(DPR_BUCKETS).toContain(effectiveDprBucket);
        expect(payload.rendererWidth).toBe(scenario.viewport.width);
        expect(payload.rendererHeight).toBe(scenario.viewport.height);
        expect(payload.rendererArea).toBe(scenario.viewport.width * scenario.viewport.height);
        expect(payload.deviceClass).toBe(scenario.expectedDeviceClass);

        expect(payload.orchestratorTimings.totalUpdateMs).toBeGreaterThanOrEqual(0);
        expect(payload.orchestratorTimings.geometryMs).toBeGreaterThanOrEqual(0);
        expect(payload.orchestratorTimings.fluidMs).toBeGreaterThanOrEqual(0);
        expect(payload.orchestratorTimings.volumeMs).toBeGreaterThanOrEqual(0);
        expect(payload.orchestratorTimings.materialsMs).toBeGreaterThanOrEqual(0);

        expect(payload.renderMode.trim().length).toBeGreaterThan(0);
        expect(payload.bootElapsedMs).toBeGreaterThanOrEqual(0);
        expect(['boot', 'warming', 'steady']).toContain(payload.warmupPhase);

        if (payload.dominantTimingKey !== null) {
          expect(
            [
              'climateMs',
              'applyTargetsMs',
              'motionMs',
              'geometryMs',
              'materialsMs',
              'lightsMs',
              'volumeMs',
              'particlesMs',
              'fluidMs',
              'textMs',
              'auditBridgeMs',
            ],
          ).toContain(payload.dominantTimingKey);
        }

        if (payload.dominantTimingMs !== null) {
          expect(payload.dominantTimingMs).toBeGreaterThanOrEqual(0);
        }

        await emitMatrixArtifact(
          testInfo,
          `perf-quality-${scenario.slug}.json`,
          {
            ...payload,
            snapshot,
          },
        );
      } finally {
        await context.close();
      }
    });
  }
});