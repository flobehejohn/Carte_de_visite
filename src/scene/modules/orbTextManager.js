import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge'; // <-- LE PONT SYNAPTIQUE

const ORB_BASE_RENDER_LAYER = 0;
const ORB_OVERLAY_RENDER_LAYER = 1;

export class OrbTextManager {
  constructor(scene) {
    this.scene = scene;

    this.worldGroup = new THREE.Group();
    this.hudGroup = new THREE.Group();

    this.scene.add(this.worldGroup);
    this.scene.add(this.hudGroup);

    this.meshes = [];
    this.progress = 0;
    this.isReady = false;

    // PHASE 4 : Abonnement aux événements du DOM
    this.focusTarget = 'none';
    this.unsubscribeBridge = oracleInteractionBridge.subscribe((detail) => {
      this.focusTarget = detail.target;
      this.applyFocusState();
    });
  }

  async loadFont() {
    this.isReady = true;
  }

  _createText(
    text,
    isHUD,
    layer,
    fontSize,
    fillOpacity,
    outlineWidth,
    renderOrder,
    yPos,
    zPos,
    role,
  ) {
    const mesh = new Text();
    mesh.text = text;
    mesh.font =
      'https://fonts.gstatic.com/s/cinzel/v11/8vIbcqZycPFAyCXT92aELQ.woff';
    mesh.fontSize = fontSize;
    mesh.color = 0xffffff;
    mesh.fillOpacity = 0;
    mesh.outlineWidth = outlineWidth;
    mesh.outlineColor = 0xffffff;
    mesh.outlineOpacity = 0;
    mesh.renderOrder = renderOrder;
    mesh.depthTest = false;
    mesh.depthWrite = false;
    mesh.textAlign = 'center';
    mesh.anchorX = 'center';
    mesh.anchorY = 'middle';
    mesh.maxWidth = isHUD ? 2.0 : 4.0;

    mesh.layers.set(layer);
    mesh.position.set(0, yPos, zPos);

    if (isHUD) {
      this.hudGroup.add(mesh);
    } else {
      this.worldGroup.add(mesh);
    }

    // Sauvegarde des bases pour permettre l'interpolation synaptique
    mesh.userData = {
      role: role,
      baseFillOpacity: fillOpacity,
      baseOutlineOpacity:
        layer === ORB_BASE_RENDER_LAYER ? fillOpacity * 0.4 : fillOpacity * 0.1,
      targetFillOpacity: fillOpacity,
      targetOutlineOpacity:
        layer === ORB_BASE_RENDER_LAYER ? fillOpacity * 0.4 : fillOpacity * 0.1,
    };

    this.meshes.push(mesh);
    return mesh;
  }

  spawnOracle({ quote, chapter }) {
    this.clear();

    // 1. CHAPITRE (HUD)
    this._createText(
      chapter,
      true,
      ORB_BASE_RENDER_LAYER,
      0.15,
      0.18,
      0.015,
      3,
      1.5,
      2.0,
      'chapter',
    );
    this._createText(
      chapter,
      true,
      ORB_OVERLAY_RENDER_LAYER,
      0.15,
      0.92,
      0.004,
      25,
      1.5,
      2.0,
      'chapter',
    );

    // 2. CITATION (World)
    this._createText(
      quote,
      false,
      ORB_BASE_RENDER_LAYER,
      0.32,
      0.18,
      0.015,
      3,
      -0.6,
      0.0,
      'quote',
    );
    this._createText(
      quote,
      false,
      ORB_OVERLAY_RENDER_LAYER,
      0.32,
      0.98,
      0.006,
      20,
      -0.6,
      0.0,
      'quote',
    );

    this.meshes.forEach((m) => m.sync());
  }

  applyFocusState() {
    // Logique de modification d'état quand le DOM envoie un signal
    this.meshes.forEach((mesh) => {
      const isBloomLayer = mesh.layers.mask === 1;

      if (this.focusTarget === 'citation') {
        // Le joueur lit le panneau HTML : L'hologramme 3D s'efface pour ne pas gêner,
        // mais le Bloom augmente pour garder une présence magique.
        mesh.userData.targetFillOpacity = mesh.userData.baseFillOpacity * 0.2;
        mesh.userData.targetOutlineOpacity = isBloomLayer ? 0.8 : 0.05;
      } else {
        // Retour à la normale
        mesh.userData.targetFillOpacity = mesh.userData.baseFillOpacity;
        mesh.userData.targetOutlineOpacity = mesh.userData.baseOutlineOpacity;
      }
    });
  }

  animateReveal(dt) {
    if (this.progress < 1.0) {
      this.progress = Math.min(1.0, this.progress + dt * 0.3);
    }

    const ease =
      this.progress < 0.5
        ? 4 * this.progress * this.progress * this.progress
        : 1 - Math.pow(-2 * this.progress + 2, 3) / 2;

    this.meshes.forEach((mesh) => {
      const targetFill = mesh.userData.targetFillOpacity * ease;
      const targetOutline = mesh.userData.targetOutlineOpacity * ease;

      // Lerp (interpolation) fluide pour une réaction organique au survol HTML
      mesh.fillOpacity += (targetFill - mesh.fillOpacity) * dt * 4.0;
      mesh.outlineOpacity += (targetOutline - mesh.outlineOpacity) * dt * 4.0;

      // On ne synchronise le SDF que si la valeur bouge vraiment
      if (
        Math.abs(targetFill - mesh.fillOpacity) > 0.005 ||
        Math.abs(targetOutline - mesh.outlineOpacity) > 0.005
      ) {
        mesh.sync();
      }
    });
  }

  clear() {
    this.meshes.forEach((mesh) => {
      mesh.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    });
    this.meshes = [];
    this.progress = 0;
    this.focusTarget = 'none';
  }

  dispose() {
    if (this.unsubscribeBridge) {
      this.unsubscribeBridge();
    }
    this.clear();
  }
}
