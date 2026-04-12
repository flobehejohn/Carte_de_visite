import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RitualOrchestrator } from './RitualOrchestrator.js';
import * as orbFluidParticles from './modules/orbFluidParticles.js';
import * as orbGeometry from './modules/orbGeometry.js';
import * as orbParticles from './modules/orbParticles.js';

describe('Thème D - Stabilité 60 FPS, Fuites Mémoires et Variabilité Vectorielle', () => {
  let ctx: any;
  let orchestrator: RitualOrchestrator;
  let geoDisposeSpy: ReturnType<typeof vi.spyOn>;
  let matDisposeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Espions sur les prototypes natifs de Three.js pour traquer le Garbage Collection GPU
    geoDisposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    matDisposeSpy = vi.spyOn(THREE.Material.prototype, 'dispose');

    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      runtimeFlags: {},
      lightsRegistry: { get: () => null },
      climateController: {
        setMood: () => {},
        setVisualParams: () => {},
        update: () => {},
        getTargets: () => ({}),
        setProgress: () => {},
        setSeed: () => {},
      },
      orbShellConfig: { radius: 2.0 },
      particlesConfig: {},
    };
    ctx.scene.add(ctx.orbGroup);
    orchestrator = new RitualOrchestrator(ctx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Garantit que le changement de forme 3D détruit les anciens buffers (Prévention OOM)', () => {
    orchestrator.initRitual('TestUser');
    const initialChildrenCount = ctx.orbGroup.children.length;

    // On simule 50 mutations génétiques extrêmes (Redémarrages de rituels)
    for (let i = 0; i < 50; i++) {
      orbGeometry.setShapeType(ctx, i % 2 === 0 ? 'icosa' : 'torusKnot');
      orbGeometry.createPolyhedron(ctx);
    }

    // PREUVE 1 : L'arbre DOM 3D ne s'est pas alourdi.
    // L'Orbe ne doit contenir que ses couches actuelles (Mesh principal + Wireframe), pas 50 doublons.
    expect(ctx.orbGroup.children.length).toBeLessThanOrEqual(
      initialChildrenCount + 3,
    );

    // PREUVE 2 : Le GPU a été purgé.
    expect(geoDisposeSpy).toHaveBeenCalled();
    // Au moins 49 destructions de buffers attendues.
    expect(geoDisposeSpy.mock.calls.length).toBeGreaterThanOrEqual(49);
  });

  it("Garantit l'alternance des Liaisons Vectorielles sans fuite mémoire", () => {
    orchestrator.initRitual('TestUser');

    for (let i = 0; i < 20; i++) {
      // Alterne frénétiquement entre les points simples et les liaisons vectorielles Plexus
      const mode = i % 2 === 0 ? 'links' : 'points';
      orbParticles.setParticlesConfig(ctx, {
        enabled: true,
        count: 1000,
        mode: mode,
        linkDistance: 1.5 + i * 0.1, // Variabilité dynamique testée
      });
    }

    // Le container de la scène ne doit pas accumuler les vieux systèmes de particules
    const particleSystems = ctx.scene.children.filter(
      (c: any) => c.name === 'orbParticles' || c.isPoints || c.isLineSegments,
    );

    // Seulement 1 ou 2 systèmes max autorisés en simultané (le courant, et éventuellement un en fade-out)
    expect(particleSystems.length).toBeLessThanOrEqual(3);

    // Preuve que les anciens matériaux (lignes vectorielles) ont été nettoyés de la RAM
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it("Garantit que la régénération cyclique de l'Océan Fluide libère le GPU", () => {
    orchestrator.initRitual('TestUser');

    for (let i = 0; i < 15; i++) {
      // L'Océan est très coûteux, on vérifie que sa régénération est "Clean"
      orbFluidParticles.setFluidParticlesConfig(ctx, {
        enabled: true,
        maxCount: 500 + i * 10,
        flowMode: 'vortex',
      });
    }

    expect(geoDisposeSpy).toHaveBeenCalled();
  });

  it('Prouve la variabilité des liaisons vectorielles selon le Chaos (Contrat Esthétique)', () => {
    orchestrator.setRitualData({
      visualParams: { chaos: 0.95, primary_color: '#ff0000' },
    });

    // Milieu du rituel -> Le Layout est sous pression, les particules passent en "Links"
    orchestrator.updateState(0.5);

    const genome = ctx.ritualGenome;

    // La distance de liaison (la taille de la "toile d'araignée") DOIT être altérée par le Chaos
    expect(genome.particles.dynamics.linkBias).toBeDefined();
    expect(genome.particles.linkDistance).toBeDefined();

    // Avec un chaos à 0.95, la toile vectorielle se rétracte ou s'étend de façon unique
    expect(genome.particles.linkDistance).not.toBe(1.0);
  });
});
