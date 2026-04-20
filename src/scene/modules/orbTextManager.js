import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge';

const ORB_BASE_RENDER_LAYER = 0;
const ORB_OVERLAY_RENDER_LAYER = 1;

export class OrbTextManager {
  constructor(scene) {
    this.scene = scene;

    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'OrbTextManager_World';
    this.hudGroup = new THREE.Group();
    this.hudGroup.name = 'OrbTextManager_HUD';

    this.scene.add(this.worldGroup);
    this.scene.add(this.hudGroup);

    this.meshes = [];
    this.progress = 0;
    this.isReady = false;

    this.focusTarget = 'none';
    this.enabled = true;

    // 🛡️ FIX VITEST & STABILITÉ : Sécurisation absolue de l'abonnement au bridge
    // Empêche les crashs si le composant est appelé dans un environnement de test non-isolé
    if (
      oracleInteractionBridge &&
      typeof oracleInteractionBridge.subscribe === 'function'
    ) {
      this.unsubscribeBridge = oracleInteractionBridge.subscribe((detail) => {
        this.focusTarget = detail?.target || 'none';
        this.applyFocusState();
      });
    } else {
      this.unsubscribeBridge = () => {};
    }
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
    if (!text) return; // 🛡️ Sécurité anti-crash si le champ texte est indéfini

    const mesh = new Text();
    mesh.text = String(text);

    // FIX GARANTI : On désactive la police externe pour éviter le crash 404 de Troika
    mesh.font = null;
    mesh.fontSize = fontSize;

    mesh.color = 0xffeebb;
    mesh.fillOpacity = 0.0;
    mesh.outlineWidth = outlineWidth;
    mesh.outlineColor = 0xffaa44;
    mesh.outlineOpacity = 0.0;

    mesh.anchorX = 'center';
    mesh.anchorY = 'middle';

    // IMPORTANT : On autorise le retour à la ligne pour ne pas déborder
    mesh.maxWidth = isHUD ? 1.5 : 2.5;
    mesh.whiteSpace = 'normal';
    mesh.textAlign = 'center';

    mesh.position.y = yPos;
    mesh.position.z = zPos;
    mesh.renderOrder = renderOrder;
    mesh.layers.set(layer);

    // Force la synchro immédiate pour éviter un flash frame
    mesh.sync();

    // Stockage structuré pour l'Interaction Bridge et les animations
    mesh.userData.role = role;
    mesh.userData.baseFillOpacity = fillOpacity;
    mesh.userData.baseOutlineOpacity = outlineWidth > 0 ? 0.3 : 0.0;
    mesh.userData.targetFillOpacity = mesh.userData.baseFillOpacity;
    mesh.userData.targetOutlineOpacity = mesh.userData.baseOutlineOpacity;

    if (isHUD) {
      this.hudGroup.add(mesh);
    } else {
      this.worldGroup.add(mesh);
    }

    this.meshes.push(mesh);
  }


  setEnabled(enabled) {
    this.enabled = enabled !== false;
    this.worldGroup.visible = this.enabled;
    this.hudGroup.visible = this.enabled;

    if (!this.enabled) {
      this.progress = 0;
      this.meshes.forEach((mesh) => {
        mesh.fillOpacity = 0.0;
        mesh.outlineOpacity = 0.0;
        mesh.sync?.();
      });
    }
  }

  applyFocusState() {
    if (!this.enabled) return;

    this.meshes.forEach((mesh) => {
      if (this.focusTarget === 'citation' && mesh.userData.role !== 'quote') {
        const isBloomLayer = mesh.layers.isEnabled(ORB_BASE_RENDER_LAYER);
        mesh.userData.targetFillOpacity = mesh.userData.baseFillOpacity * 0.2;
        mesh.userData.targetOutlineOpacity = isBloomLayer ? 0.8 : 0.05;
      } else {
        mesh.userData.targetFillOpacity = mesh.userData.baseFillOpacity;
        mesh.userData.targetOutlineOpacity = mesh.userData.baseOutlineOpacity;
      }
    });
  }

  animateReveal(dt) {
    if (!this.enabled) return;

    // 🛡️ PROTECTION FRAME-DROP : Limite dt à 100ms maximum
    // Si l'utilisateur change d'onglet, dt explose. Ceci empêche la mathématique de casser.
    const safeDt = Math.min(dt, 0.1);

    if (this.progress < 1.0) {
      this.progress = Math.min(1.0, this.progress + safeDt * 0.3);
    }

    const ease =
      this.progress < 0.5
        ? 4 * this.progress * this.progress * this.progress
        : 1 - Math.pow(-2 * this.progress + 2, 3) / 2;

    this.meshes.forEach((mesh) => {
      const targetFill = mesh.userData.targetFillOpacity * ease;
      const targetOutline = mesh.userData.targetOutlineOpacity * ease;

      mesh.fillOpacity += (targetFill - mesh.fillOpacity) * safeDt * 4.0;
      mesh.outlineOpacity +=
        (targetOutline - mesh.outlineOpacity) * safeDt * 4.0;

      // 🛡️ OPTIMISATION CPU : Ne déclenche sync() que si la valeur a significativement changé
      if (
        Math.abs(targetFill - mesh.fillOpacity) > 0.005 ||
        Math.abs(targetOutline - mesh.outlineOpacity) > 0.005
      ) {
        mesh.sync();
      }
    });
  }

  spawnOracle(data) {
    this.clear();
    if (!this.enabled) return;
    this.progress = 0;
    if (!data) return;

    // 🔴 PHASE 8 - DIÈTE 3D : Suppression totale du champ 'interpretation'
    const { quote, chapter, author } = data;

    // 1. HUD: Chapitre (Haut)
    if (chapter) {
      this._createText(
        chapter,
        true,
        ORB_OVERLAY_RENDER_LAYER,
        0.08,
        0.9,
        0.002,
        999,
        0.35,
        0,
        'chapter',
      );
    }

    // 2. WORLD: Tension Centrale (Milieu, holographique)
    if (quote) {
      this._createText(
        quote,
        false,
        ORB_OVERLAY_RENDER_LAYER,
        0.12,
        0.95,
        0.003,
        10,
        0,
        1.2,
        'quote',
      );
      this._createText(
        quote,
        false,
        ORB_BASE_RENDER_LAYER,
        0.12,
        0.2,
        0.015,
        5,
        0,
        1.2,
        'quote-bloom',
      );
    }

    // 3. HUD: Auteur (Bas droite)
    if (author) {
      this._createText(
        `— ${author}`,
        true,
        ORB_OVERLAY_RENDER_LAYER,
        0.04,
        0.6,
        0.001,
        999,
        -0.4,
        0,
        'author',
      );
    }
  }

  clear() {
    if (this.meshes) {
      this.meshes.forEach((mesh) => {
        if (mesh.parent) mesh.parent.remove(mesh);
        // Libération correcte des ressources Troika (Geometry/Material natifs)
        if (typeof mesh.dispose === 'function') mesh.dispose();
      });
      this.meshes = [];
    }

    // 🔴 PHASE 8 - RESET IMPLACABLE : Purge radicale des groupes pour tuer les fantômes
    if (this.worldGroup) {
      while (this.worldGroup.children.length > 0) {
        this.worldGroup.remove(this.worldGroup.children[0]);
      }
    }
    if (this.hudGroup) {
      while (this.hudGroup.children.length > 0) {
        this.hudGroup.remove(this.hudGroup.children[0]);
      }
    }

    this.progress = 0;
  }

  // 🛡️ MEMORY LEAK PROTECTOR : Utilisé au démontage total du composant React / WebGL
  dispose() {
    this.clear();
    if (typeof this.unsubscribeBridge === 'function') {
      this.unsubscribeBridge();
    }
    if (this.worldGroup && this.worldGroup.parent) {
      this.worldGroup.parent.remove(this.worldGroup);
    }
    if (this.hudGroup && this.hudGroup.parent) {
      this.hudGroup.parent.remove(this.hudGroup);
    }
  }
}
