import { describe, expect, it } from 'vitest';
import { resolveDirectives } from './semanticTypography';
import { mapDirectivesToTroika } from './troikaMapper';

describe('Gouvernance WebGL (Phase 2) - Traduction Physique Troika', () => {
  it('C1: Traduit un texte critique P1 (Quote) en Mesh Lisible Overlay (HUD = false)', () => {
    const directives = resolveDirectives('P1');
    const physical = mapDirectivesToTroika(directives, '3d_world', false);

    expect(physical.fontSize).toBe(0.42); // 'lg' = 0.42 en 3D
    expect(physical.layer).toBe(1); // ORB_OVERLAY_RENDER_LAYER
    expect(physical.isHUD).toBe(false); // Ancré dans le monde
    expect(physical.fillOpacity).toBe(0.98); // Contraste High
  });

  it('C2: Traduit un texte charnière P2 (Chapter) en Mesh Lisible HUD', () => {
    const directives = resolveDirectives('P2');
    const physical = mapDirectivesToTroika(directives, '3d_hud', false);

    expect(physical.fontSize).toBe(0.15); // 'md'
    expect(physical.isHUD).toBe(true); // Attaché à la caméra
    expect(physical.renderOrder).toBeGreaterThan(20); // Doit passer au-dessus de tout
  });

  it('C3: Sépare correctement le GlowProxy (Bloom) du ReadableMesh', () => {
    const directives = resolveDirectives('P1');

    const proxy = mapDirectivesToTroika(directives, '3d_world', true);
    const readable = mapDirectivesToTroika(directives, '3d_world', false);

    // Le Proxy va sur la couche 0 (Bloom), le lisible sur la couche 1
    expect(proxy.layer).toBe(0);
    expect(readable.layer).toBe(1);

    // Le Proxy est transparent pour le bloom, le lisible est quasi-opaque
    expect(proxy.fillOpacity).toBe(0.18);
    expect(readable.fillOpacity).toBe(0.98);

    // Le contour du proxy est plus épais pour générer un beau halo
    expect(proxy.outlineWidth).toBeGreaterThan(readable.outlineWidth);
  });
});
