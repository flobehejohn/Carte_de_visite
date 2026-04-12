import { describe, expect, it } from 'vitest';
import { normalizeVisualParams } from './visualParams';

describe('normalizeVisualParams', () => {
  it('normalise et clamp les valeurs de base + extras', () => {
    const vp = normalizeVisualParams({
      primary_color: '0xffaa00',
      chaos: 2,
      fog_density: -1,
      shape_archetype: 'sphere',
      seed: '  demo  ',
      palette_mode: 'analog',
      wire_layers: 9,
      particle_density: 0.75,
      motion_signature: 'breath'
    });

    expect(vp.primary_color).toBe('#ffaa00');
    expect(vp.chaos).toBe(1);
    expect(vp.fog_density).toBe(0);
    expect(vp.shape_archetype).toBe('sphere');
    expect(vp.seed).toBe('demo');
    expect(vp.palette_mode).toBe('analog');
    expect(vp.wire_layers).toBe(6);
    expect(vp.particle_density).toBeCloseTo(0.75, 4);
    expect(vp.motion_signature).toBe('breath');
  });

  it('ignore les champs invalides (ne force pas à 0)', () => {
    const vp = normalizeVisualParams({
      primary_color: 'red',
      chaos: 'nope',
      fog_density: null,
      shape_archetype: 'unknown',
      palette_mode: 'bad',
      wire_layers: 99,
      particle_density: 'x',
      motion_signature: 'fast'
    });

    expect(vp.primary_color).toBeUndefined();
    expect(vp.chaos).toBeUndefined();
    expect(vp.fog_density).toBeUndefined();
    expect(vp.shape_archetype).toBeUndefined();
    expect(vp.palette_mode).toBeUndefined();
    expect(vp.wire_layers).toBeUndefined();
    expect(vp.particle_density).toBeUndefined();
    expect(vp.motion_signature).toBeUndefined();
  });
});
