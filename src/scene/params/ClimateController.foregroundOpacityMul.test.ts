import { describe, it, expect } from 'vitest';
import { ClimateController, CLIMATE_PRESET_NAMES } from './ClimateController';

const GRID_MAX = 80;
const GRID_SIZE = GRID_MAX + 1;

function findComboForPreset(targetPresetName: string): { seed: string; mood: string } {
  for (let i = 0; i <= GRID_MAX; i += 1) {
    const seed = `testS${i}`;
    const controller = new ClimateController({ seed });
    for (let j = 0; j <= GRID_MAX; j += 1) {
      const mood = `testM${j}`;
      controller.setMood(mood);
      controller.setProgress(0.10);
      controller.update(1);
      const presetName = controller.getTargets().presetName;
      if (presetName === targetPresetName) {
        return { seed, mood };
      }
    }
  }
  throw new Error(`Preset not found: ${targetPresetName} (grid ${GRID_SIZE}x${GRID_SIZE})`);
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

describe('ClimateController foregroundOpacityMul', () => {
  it('Aurore vs Cendre - foregroundOpacityMul diff significatif', () => {
    const comboA = findComboForPreset('Aurore');
    const comboC = findComboForPreset('Cendre');
    const progresses = [0.1, 0.25];

    for (const progress of progresses) {
      const ctrlA = new ClimateController({ seed: comboA.seed });
      ctrlA.setMood(comboA.mood);
      ctrlA.setProgress(progress);
      ctrlA.update(1);
      const fgA = requireFiniteNumber(ctrlA.getTargets().opacity.foregroundOpacity, `Aurore fg @${progress}`);
      expect(fgA).toBeLessThanOrEqual(0.25);

      const ctrlC = new ClimateController({ seed: comboC.seed });
      ctrlC.setMood(comboC.mood);
      ctrlC.setProgress(progress);
      ctrlC.update(1);
      const fgC = requireFiniteNumber(ctrlC.getTargets().opacity.foregroundOpacity, `Cendre fg @${progress}`);
      expect(fgC).toBeGreaterThanOrEqual(0.9);
      expect(fgC - fgA).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('CLIMATE_PRESET_NAMES - foregroundOpacity finite et dans range', () => {
    for (const presetName of CLIMATE_PRESET_NAMES) {
      const combo = findComboForPreset(presetName);
      const controller = new ClimateController({ seed: combo.seed });
      controller.setMood(combo.mood);
      controller.setProgress(0.25);
      controller.update(1);
      const fg = requireFiniteNumber(controller.getTargets().opacity.foregroundOpacity, `${presetName} fg`);
      expect(fg).toBeGreaterThanOrEqual(0.0);
      expect(fg).toBeLessThanOrEqual(1.25);
    }
  });
});
