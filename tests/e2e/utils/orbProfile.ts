import { expect, type Page } from '@playwright/test';
import { readSerializableSnapshot } from './orbAudit';

export const QUALITY_PROFILES = ['ultra', 'high', 'medium', 'low', 'safe'] as const;

export type QualityProfileName = (typeof QUALITY_PROFILES)[number];

export function readNestedString(payload: Record<string, unknown>, path: string): string | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function readProfileState(page: Page): Promise<{
  active: string | null;
  forced: string | null;
}> {
  const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;

  return {
    active:
      readNestedString(snapshot, 'activeQualityProfile') ??
      readNestedString(snapshot, 'qualityProfiles.current') ??
      readNestedString(snapshot, 'qualityProfile'),
    forced:
      readNestedString(snapshot, 'forcedQualityProfile') ??
      readNestedString(snapshot, 'qualityProfiles.forced'),
  };
}

async function applyProfile(page: Page, profile: QualityProfileName): Promise<void> {
  await page.evaluate(async (nextProfile) => {
    const audit = (window as any).__ORB_AUDIT__;

    if (!audit || typeof audit.setQualityProfile !== 'function') {
      throw new Error('__ORB_AUDIT__.setQualityProfile indisponible.');
    }

    await audit.setQualityProfile(nextProfile);
  }, profile);
}

export async function forceQualityProfile(page: Page, profile: QualityProfileName): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await applyProfile(page, profile);

    try {
      await expect
        .poll(() => readProfileState(page), {
          timeout: 10_000,
          intervals: [250, 500, 1_000],
          message: `Le profil forcé n'est pas devenu actif: ${profile}`,
        })
        .toEqual({
          active: profile,
          forced: profile,
        });

      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Le profil forcé n'est pas devenu actif: ${profile}`);
}