# Phase 3 — 3D Text Integration

## 1. Constat d’architecture sur l’état actuel du repo

### 1.1 Chaîne actuelle
- [`OracleLayout.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/layout/OracleLayout.tsx#L27) superpose trois couches :
  - `RitualWizard` et la scène 3D.
  - un rideau DOM `z-[45]`.
  - un overlay HTML `z-50` avec [`OracleOverlay`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/OracleOverlay.tsx#L34).
- [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2200) transmet déjà `quote`, `chapter`, `interpretation` et `author` à `RitualOrchestrator.triggerFinalRevelation()`.
- [`RitualOrchestrator.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/RitualOrchestrator.js#L256) instancie `OrbTextManager`, mais continue aussi d’initialiser et d’animer l’ancien sprite textuel [`orbText.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbText.js#L11).
- [`orbTextManager.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbTextManager.js#L1) est un prototype hybride :
  - `TextGeometry`
  - `FontLoader`
  - `three/tsl`
  - `three/webgpu`
- Le renderer réel de la scène reste pourtant un [`THREE.WebGLRenderer`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L862).

### 1.2 Conclusion forensic
- Il existe aujourd’hui **trois systèmes de texte concurrents** :
  - le HUD HTML `OracleOverlay`
  - le sprite canvas `orbText.js`
  - le proto 3D `orbTextManager.js`
- Pour réussir la phase 3, il faut **une seule autorité textuelle**.
- Cette autorité doit :
  - vivre dans le canvas WebGL
  - être compatible avec le renderer actuel
  - rester nette sous bloom/fog/particules
  - supporter du texte court et long
  - être testable en E2E/VRT sans dépendre du DOM HTML

## 2. Stratégie retenue et justification

### 2.1 Comparatif de stratégies

| Option | Avantages | Limites dans ce repo | Verdict |
| --- | --- | --- | --- |
| `TextGeometry` | natif Three, extrusions volumétriques, bon pour un titre sculptural | très coûteux pour `interpretation`, wrapping faible, dépend d’un JSON de police, triangles explosifs, prototype actuel couplé à `three/webgpu` alors que la scène est en WebGL | non retenu |
| Troika (`troika-three-text`) | SDF, wrapping, anchors, `maxWidth`, opacité/outline/stroke, rendu WebGL net, `sync()` déterministe, bon pour `quote`, `chapter`, `interpretation` | nécessite une dépendance et des assets de police locaux | **retenu** |
| SDF maison complet | contrôle maximal, shaders sur mesure, layout propriétaire | trop coûteux, risque élevé, réinvente Troika | non retenu |

### 2.2 Décision
- La stratégie recommandée est **Troika SDF** comme moteur unique de typographie 3D.
- `TextGeometry` peut rester éventuellement pour une phase artistique ultérieure sur une citation monumentale “sculptée”, mais **pas comme moteur primaire** de tout le texte oracle.

### 2.3 Pourquoi Troika est le bon choix ici
- Le repo doit afficher :
  - `chapter`
  - `quote`
  - `interpretation` / `composition.prose`
  - potentiellement `author`, `keywords`, CTA
- `Troika` gère naturellement :
  - le multi-ligne
  - le `maxWidth`
  - le `lineHeight`
  - le `letterSpacing`
  - la haute netteté sur grands et petits viewports
  - le `sync()` indispensable pour les screenshots VRT stables
- Le manager actuel importe `three/webgpu` dans [`orbTextManager.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbTextManager.js#L12), alors que la scène est rendue par [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L862) en WebGL. Troika supprime cette incohérence de backend.

## 3. Architecture cible

### 3.1 Principe global
- Le HUD HTML `[data-testid='oracle-overlay']` disparaît.
- Le texte final est rendu par **un `OracleTextRig` 3D** géré par `OrbTextManager`.
- Ce rig comporte deux sous-espaces :
  - `worldRig` : texte intégré à la scène, en espace monde, pour la citation et les halos.
  - `hudRig` : texte attaché à la caméra, pour `chapter`, `interpretation`, `author`, `keywords`, CTA.

### 3.2 Principe de lisibilité avec le pipeline actuel
- La scène possède déjà deux couches :
  - `ORB_BASE_RENDER_LAYER` : passe bloom/composer.
  - `ORB_OVERLAY_RENDER_LAYER` : passe directe par-dessus.
- Il faut exploiter ce split pour le texte :
  - **Readable Mesh** : couche overlay, nette, sans fog, sans blur.
  - **Glow Proxy Mesh** : couche base, additive, faible opacité, destinée à nourrir le bloom.

### 3.3 Répartition recommandée
- `chapter` :
  - `hudRig`
  - overlay readable text
  - base glow proxy discret
- `quote` :
  - `worldRig`
  - grand texte semi-lointain derrière/au-dessus de l’orbe
  - base lit text + overlay readable echo si nécessaire
- `interpretation` :
  - `hudRig`
  - texte multi-ligne lisible
  - overlay readable mesh + glow proxy très léger
- `author` / `keywords` :
  - `hudRig`
  - petits labels
- CTA de fermeture :
  - phase 1 : clavier (`Enter` / `Escape`) et test hook
  - phase 2 : bouton 3D raycastable

## 4. Pré-requis d’implémentation

### 4.1 Dépendances
- Ajouter `troika-three-text`.

### 4.2 Assets de police
- Ne pas charger les polices depuis `threejs.org`.
- Utiliser des fichiers locaux versionnés, par exemple :
  - `/fonts/OracleDisplay-SemiBold.woff2`
  - `/fonts/OracleBody-Regular.woff2`
  - `/fonts/OracleMono-Medium.woff2`

### 4.3 Nettoyage d’autorité
- `orbText.js` doit être retiré de la révélation finale.
- `OracleOverlay.tsx` doit être supprimé du flux runtime final.
- `OrbTextManager` devient l’unique autorité de layout et de reveal textuel.

## 5. Code JS exact recommandé pour `orbTextManager.js`

### 5.1 Objectif du code ci-dessous
- Remplacer le manager actuel par un manager Troika compatible WebGL.
- Afficher directement :
  - `oracleData.chapter`
  - `oracleData.quote`
  - `oracleData.interpretation`
  - `oracleData.author`
- Générer un rendu “Hologramme Sublime” avec :
  - mesh lisible sur couche overlay
  - proxy glow sur couche bloom
  - shader scanlines / shimmer / reveal
  - intégration aux couleurs dynamiques de la scène

### 5.2 Code proposé

```js
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import {
  ORB_BASE_RENDER_LAYER,
  ORB_OVERLAY_RENDER_LAYER,
} from './orbFluidParticles.js';

const DISPLAY_FONT_URL = '/fonts/OracleDisplay-SemiBold.woff2';
const BODY_FONT_URL = '/fonts/OracleBody-Regular.woff2';
const MONO_FONT_URL = '/fonts/OracleMono-Medium.woff2';

const TMP_COLOR = new THREE.Color();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function asText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOracleData(payload = {}) {
  return {
    chapter:
      asText(payload?.hermeneutic?.chapter) ||
      asText(payload?.chapter) ||
      'REVELATION',
    quote:
      asText(payload?.hermeneutic?.quote) ||
      asText(payload?.quote) ||
      'Le silence parle.',
    interpretation:
      asText(payload?.composition?.prose) ||
      asText(payload?.interpretation) ||
      'Analyse en cours...',
    author: asText(payload?.author, 'Zarathoustra'),
    keywords: Array.isArray(payload?.keywords) ? payload.keywords : [],
  };
}

function makeBaseMaterial({
  color = 0xffffff,
  opacity = 1,
  blending = THREE.NormalBlending,
  depthTest = false,
  depthWrite = false,
}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending,
    depthTest,
    depthWrite,
    toneMapped: false,
    fog: false,
  });
}

function patchHologramMaterial(material, uniformsConfig = {}) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uReveal = { value: 0 };
    shader.uniforms.uPulse = { value: 0 };
    shader.uniforms.uGlowColor = {
      value: new THREE.Color(uniformsConfig.glowColor ?? 0x89c2ff),
    };
    shader.uniforms.uAccentColor = {
      value: new THREE.Color(uniformsConfig.accentColor ?? 0xffd86b),
    };
    shader.uniforms.uScanDensity = { value: uniformsConfig.scanDensity ?? 140.0 };
    shader.uniforms.uNoiseAmount = { value: uniformsConfig.noiseAmount ?? 0.08 };

    material.userData = material.userData || {};
    material.userData.shader = shader;

    shader.vertexShader = `
      varying vec2 vUvOracle;
      varying vec3 vWorldOracle;
      ${shader.vertexShader}
    `
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n vUvOracle = uv;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n vWorldOracle = worldPosition.xyz;',
      );

    shader.fragmentShader = `
      uniform float uTime;
      uniform float uReveal;
      uniform float uPulse;
      uniform vec3 uGlowColor;
      uniform vec3 uAccentColor;
      uniform float uScanDensity;
      uniform float uNoiseAmount;
      varying vec2 vUvOracle;
      varying vec3 vWorldOracle;

      float oracleHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float oracleNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = oracleHash(i);
        float b = oracleHash(i + vec2(1.0, 0.0));
        float c = oracleHash(i + vec2(0.0, 1.0));
        float d = oracleHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      ${shader.fragmentShader}
    `.replace(
      '#include <output_fragment>',
      `
        float scan = 0.92 + 0.08 * sin(vUvOracle.y * uScanDensity + uTime * 6.0);
        float shimmer = oracleNoise(vUvOracle * 18.0 + uTime * 0.25);
        float revealMask = smoothstep(0.0, 0.12, uReveal - (1.0 - vUvOracle.x));
        vec3 holoMix = mix(uGlowColor, uAccentColor, 0.35 + 0.35 * shimmer);
        gl_FragColor.rgb *= holoMix;
        gl_FragColor.rgb *= scan * (1.0 + uPulse * 0.12);
        gl_FragColor.rgb += holoMix * (0.06 + shimmer * uNoiseAmount);
        gl_FragColor.a *= revealMask;
        #include <output_fragment>
      `,
    );
  };

  return material;
}

function applyTextFlags(textMesh, layer, renderOrder) {
  textMesh.layers.set(layer);
  textMesh.renderOrder = renderOrder;
  textMesh.frustumCulled = false;
  textMesh.material.transparent = true;
  textMesh.material.depthWrite = false;
  textMesh.material.toneMapped = false;
  textMesh.material.fog = false;
}

function syncText(textNode) {
  return new Promise(resolve => {
    textNode.sync(() => resolve(textNode));
  });
}

export class OrbTextManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.camera = ctx.camera || null;

    this.root = new THREE.Group();
    this.root.name = 'OracleTextRoot';
    this.root.visible = false;
    this.scene.add(this.root);

    this.worldRig = new THREE.Group();
    this.worldRig.name = 'OracleWorldTextRig';
    this.root.add(this.worldRig);

    this.hudRig = new THREE.Group();
    this.hudRig.name = 'OracleHudTextRig';
    this.root.add(this.hudRig);

    this.payload = normalizeOracleData();
    this.revealProgress = { value: 0 };
    this.time = 0;
    this.ready = false;
    this._syncToken = 0;

    this.nodes = this.createNodes();
    this.attachCamera(this.camera);
  }

  attachCamera(camera) {
    if (!camera) return;

    this.camera = camera;
    if (this.hudRig.parent !== camera) {
      this.root.remove(this.hudRig);
      camera.add(this.hudRig);
    }

    this.hudRig.position.set(0, -0.18, -4.25);
    this.hudRig.rotation.set(0, 0, 0);
    this.hudRig.scale.setScalar(1);
  }

  createTextNode({
    name,
    font,
    fontSize,
    maxWidth,
    lineHeight = 1.2,
    letterSpacing = 0,
    color,
    outlineColor,
    outlineWidth = 0,
    anchorX = 'center',
    anchorY = 'middle',
    textAlign = 'center',
    blending = THREE.NormalBlending,
    layer = ORB_OVERLAY_RENDER_LAYER,
    renderOrder = 20,
    fillOpacity = 1,
    strokeOpacity = 0,
  }) {
    const text = new Text();
    text.name = name;
    text.text = '';
    text.font = font;
    text.fontSize = fontSize;
    text.maxWidth = maxWidth;
    text.lineHeight = lineHeight;
    text.letterSpacing = letterSpacing;
    text.anchorX = anchorX;
    text.anchorY = anchorY;
    text.textAlign = textAlign;
    text.color = color;
    text.outlineColor = outlineColor;
    text.outlineWidth = outlineWidth;
    text.fillOpacity = fillOpacity;
    text.strokeOpacity = strokeOpacity;
    text.material = patchHologramMaterial(
      makeBaseMaterial({
        color,
        opacity: fillOpacity,
        blending,
        depthTest: layer === ORB_BASE_RENDER_LAYER,
        depthWrite: false,
      }),
      { glowColor: color, accentColor: outlineColor },
    );
    applyTextFlags(text, layer, renderOrder);
    return text;
  }

  createNodes() {
    const nodes = {
      chapterGlow: this.createTextNode({
        name: 'OracleChapterGlow',
        font: MONO_FONT_URL,
        fontSize: 0.15,
        maxWidth: 3.8,
        letterSpacing: 0.06,
        color: 0xffd86b,
        outlineColor: 0xfff0c0,
        outlineWidth: 0.008,
        blending: THREE.AdditiveBlending,
        layer: ORB_BASE_RENDER_LAYER,
        renderOrder: 4,
        fillOpacity: 0.22,
      }),
      chapterReadable: this.createTextNode({
        name: 'OracleChapterReadable',
        font: MONO_FONT_URL,
        fontSize: 0.15,
        maxWidth: 3.8,
        letterSpacing: 0.06,
        color: 0xffd86b,
        outlineColor: 0xfff0c0,
        outlineWidth: 0.004,
        layer: ORB_OVERLAY_RENDER_LAYER,
        renderOrder: 24,
        fillOpacity: 0.98,
      }),
      quoteGlow: this.createTextNode({
        name: 'OracleQuoteGlow',
        font: DISPLAY_FONT_URL,
        fontSize: 0.42,
        maxWidth: 9.0,
        lineHeight: 1.15,
        color: 0xa6d8ff,
        outlineColor: 0xf6d47a,
        outlineWidth: 0.015,
        blending: THREE.AdditiveBlending,
        layer: ORB_BASE_RENDER_LAYER,
        renderOrder: 3,
        fillOpacity: 0.18,
      }),
      quoteReadable: this.createTextNode({
        name: 'OracleQuoteReadable',
        font: DISPLAY_FONT_URL,
        fontSize: 0.42,
        maxWidth: 9.0,
        lineHeight: 1.15,
        color: 0xeaf6ff,
        outlineColor: 0xf6d47a,
        outlineWidth: 0.006,
        layer: ORB_OVERLAY_RENDER_LAYER,
        renderOrder: 26,
        fillOpacity: 0.92,
      }),
      bodyGlow: this.createTextNode({
        name: 'OracleBodyGlow',
        font: BODY_FONT_URL,
        fontSize: 0.115,
        maxWidth: 4.8,
        lineHeight: 1.45,
        color: 0xa6d8ff,
        outlineColor: 0xc4e7ff,
        outlineWidth: 0.006,
        blending: THREE.AdditiveBlending,
        layer: ORB_BASE_RENDER_LAYER,
        renderOrder: 4,
        fillOpacity: 0.16,
      }),
      bodyReadable: this.createTextNode({
        name: 'OracleBodyReadable',
        font: BODY_FONT_URL,
        fontSize: 0.115,
        maxWidth: 4.8,
        lineHeight: 1.45,
        color: 0xf1f7ff,
        outlineColor: 0x9bc9ff,
        outlineWidth: 0.002,
        layer: ORB_OVERLAY_RENDER_LAYER,
        renderOrder: 25,
        fillOpacity: 0.96,
      }),
      authorReadable: this.createTextNode({
        name: 'OracleAuthorReadable',
        font: MONO_FONT_URL,
        fontSize: 0.09,
        maxWidth: 3.8,
        letterSpacing: 0.04,
        color: 0x89c2ff,
        outlineColor: 0xd7f0ff,
        outlineWidth: 0.002,
        anchorX: 'right',
        textAlign: 'right',
        layer: ORB_OVERLAY_RENDER_LAYER,
        renderOrder: 27,
        fillOpacity: 0.9,
      }),
    };

    this.worldRig.add(nodes.quoteGlow);
    this.worldRig.add(nodes.quoteReadable);
    this.hudRig.add(nodes.chapterGlow);
    this.hudRig.add(nodes.chapterReadable);
    this.hudRig.add(nodes.bodyGlow);
    this.hudRig.add(nodes.bodyReadable);
    this.hudRig.add(nodes.authorReadable);

    nodes.chapterGlow.position.set(0, 1.08, 0);
    nodes.chapterReadable.position.copy(nodes.chapterGlow.position);

    nodes.bodyGlow.position.set(0, -0.62, 0);
    nodes.bodyReadable.position.copy(nodes.bodyGlow.position);

    nodes.authorReadable.position.set(2.2, -1.55, 0);

    nodes.quoteGlow.position.set(0, 2.0, -3.6);
    nodes.quoteReadable.position.set(0, 1.96, -3.18);
    nodes.quoteReadable.rotation.x = -0.06;

    return nodes;
  }

  async setOraclePayload(oracleData) {
    this.payload = normalizeOracleData(oracleData);
    this.root.visible = true;

    const chapter = this.payload.chapter.toUpperCase();
    const quote = `“${this.payload.quote}”`;
    const interpretation = this.payload.interpretation;
    const author = `${this.payload.author}`.toUpperCase();

    this.nodes.chapterGlow.text = chapter;
    this.nodes.chapterReadable.text = chapter;
    this.nodes.quoteGlow.text = quote;
    this.nodes.quoteReadable.text = quote;
    this.nodes.bodyGlow.text = interpretation;
    this.nodes.bodyReadable.text = interpretation;
    this.nodes.authorReadable.text = author;

    const token = ++this._syncToken;
    await Promise.all(
      Object.values(this.nodes).map(node => syncText(node)),
    );

    if (token !== this._syncToken) return;

    this.ready = true;
  }

  async spawnOracle(oracleData) {
    this.revealProgress.value = 0;
    await this.setOraclePayload(oracleData);
  }

  setAtmosphere({
    lightColor = 0xa6d8ff,
    accentColor = 0xffd86b,
    energy = 0.3,
    bloomStrength = 0.2,
  } = {}) {
    for (const node of Object.values(this.nodes)) {
      const shader = node.material?.userData?.shader;
      if (!shader) continue;

      shader.uniforms.uGlowColor.value.set(lightColor);
      shader.uniforms.uAccentColor.value.set(accentColor);
      shader.uniforms.uPulse.value = clamp01(energy * 0.65 + bloomStrength * 0.35);
    }
  }

  update(dt, runtime = {}) {
    if (!this.root.visible) return;

    this.time += dt;
    const revealSpeed = runtime?.revealSpeed ?? 0.28;
    this.revealProgress.value = clamp01(
      this.revealProgress.value + dt * revealSpeed,
    );

    const energy = clamp01(runtime?.energy ?? 0.35);
    const bloomStrength = clamp(runtime?.bloomStrength ?? 0.2, 0, 1.5);
    const lightColor = runtime?.lightColor || 0x9bc9ff;
    const accentColor = runtime?.accentColor || 0xffd86b;

    this.setAtmosphere({ lightColor, accentColor, energy, bloomStrength });

    for (const node of Object.values(this.nodes)) {
      const shader = node.material?.userData?.shader;
      if (shader) {
        shader.uniforms.uTime.value = this.time;
        shader.uniforms.uReveal.value = this.revealProgress.value;
      }
    }

    const breath = 1.0 + Math.sin(this.time * 1.25) * 0.012;
    this.worldRig.scale.setScalar(breath);
    this.worldRig.rotation.y = Math.sin(this.time * 0.16) * 0.08;
    this.hudRig.position.y = -0.18 + Math.sin(this.time * 0.55) * 0.02;

    const chapterAlpha = 0.35 + this.revealProgress.value * 0.65;
    const bodyAlpha = 0.15 + this.revealProgress.value * 0.85;
    const quoteAlpha = 0.1 + this.revealProgress.value * 0.9;

    this.nodes.chapterReadable.material.opacity = chapterAlpha;
    this.nodes.chapterGlow.material.opacity = chapterAlpha * 0.22;
    this.nodes.bodyReadable.material.opacity = bodyAlpha;
    this.nodes.bodyGlow.material.opacity = bodyAlpha * 0.18;
    this.nodes.quoteReadable.material.opacity = quoteAlpha * 0.82;
    this.nodes.quoteGlow.material.opacity = quoteAlpha * 0.18;
    this.nodes.authorReadable.material.opacity = bodyAlpha * 0.78;
  }

  getAuditState() {
    return {
      ready: this.ready,
      visible: this.root.visible,
      revealProgress: this.revealProgress.value,
      chapter: this.payload.chapter,
      quote: this.payload.quote,
      interpretationLength: this.payload.interpretation.length,
      nodeCount: Object.keys(this.nodes).length,
    };
  }

  clear() {
    this.payload = normalizeOracleData();
    this.revealProgress.value = 0;
    this.ready = false;
    this.root.visible = false;

    for (const node of Object.values(this.nodes)) {
      node.text = '';
    }
  }

  async sync() {
    await Promise.all(Object.values(this.nodes).map(node => syncText(node)));
  }

  dispose() {
    for (const node of Object.values(this.nodes)) {
      node.dispose();
      node.parent?.remove(node);
    }

    this.hudRig.parent?.remove(this.hudRig);
    this.worldRig.parent?.remove(this.worldRig);
    this.root.parent?.remove(this.root);
  }
}
```

### 5.3 Pourquoi ce code règle les limites actuelles
- Plus d’import `three/webgpu`.
- Plus de `TextGeometry` pour le body long.
- Plus de dépendance au `FontLoader` distant `threejs.org`.
- Le texte HUD est net sur la couche overlay.
- Le glow proxy nourrit le bloom existant sans sacrifier la lisibilité.
- Le manager expose `sync()` et `getAuditState()`, essentiels pour l’E2E et la VRT.

## 6. Techniques “Hologramme Sublime”

### 6.1 Double rendu : lisibilité + halo
- Chaque zone de texte importante existe en deux copies :
  - une copie overlay lisible
  - une copie base glow
- Bénéfice :
  - la lecture reste nette
  - le bloom continue d’exister
  - le texte semble intégré à la scène au lieu d’être une simple UI collée

### 6.2 Shader patch `onBeforeCompile`
- Le patch du matériau introduit :
  - scanlines verticales
  - shimmer basse fréquence
  - reveal progressif gauche → droite
  - variation de teinte entre `lightColor` et `accentColor`
- Cette technique est cohérente avec les effets déjà présents :
  - voile procédural dans [`RitualOrchestrator.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/RitualOrchestrator.js#L375)
  - `UnrealBloomPass` dans [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L907)

### 6.3 Ancrage monde vs ancrage caméra
- `quote` :
  - espace monde
  - plus cinématique
  - peut respirer derrière l’orbe
- `chapter` / `interpretation` :
  - espace caméra
  - remplace proprement le HUD HTML
  - stabilité visuelle élevée sur desktop/mobile

### 6.4 Variantes artistiques recommandées
- `chapter` :
  - monospace fin
  - tracking large
  - teinte ambre
- `quote` :
  - display serif ou grotesk sculptural
  - grande taille
  - légère rotation et respiration
- `interpretation` :
  - fonte body lisible
  - opacité proche de 1 en fin de reveal
  - glow proxy très léger

## 7. Orchestration du handoff React -> WebGL

## 7.1 Ce qui existe déjà
- [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2200) fait déjà le pont React -> orchestrateur.
- [`RitualOrchestrator.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/RitualOrchestrator.js#L446) déclenche déjà la révélation finale.

## 7.2 Ce qu’il faut changer conceptuellement

### OracleLayout
- Supprimer le montage de :
  - `OracleOverlay`
  - le rideau DOM `z-[45]`
- L’obscurcissement final doit être pris en charge par la scène elle-même :
  - `foregroundMesh`
  - ou un nouveau `hudVeilMesh` attaché caméra

### Oracle3DScene
- Conserver le pont React -> WebGL.
- Étendre le payload envoyé à `triggerFinalRevelation()` avec tout le JSON utile :

```ts
const oracleData3D = {
  quote,
  chapter: chapter || 'REVELATION',
  interpretation: prose,
  author: result.author || 'Zarathoustra',
  keywords: result.keywords || [],
}
orch.triggerFinalRevelation(oracleData3D)
```

### RitualOrchestrator
- Remplacer `new OrbTextManager(ctx.scene)` par `new OrbTextManager(this.ctx)`.
- Garder `this.textManager.attachCamera(this.ctx.camera)` si la caméra change.
- Supprimer l’autorité de `orbText.js` sur la révélation finale.

### Flux cible
1. React reçoit le résultat final.
2. `Oracle3DScene` normalise `quote`, `chapter`, `interpretation`, `author`, `keywords`.
3. `Oracle3DScene` appelle `orch.triggerFinalRevelation(payload)`.
4. `RitualOrchestrator` :
   - active `isRevealing`
   - pousse la caméra
   - transmet le payload à `textManager.spawnOracle(payload)`
5. `textManager` :
   - synchronise Troika
   - active `root.visible`
   - anime le reveal et les shaders
6. Le DOM HTML n’intervient plus.

## 7.3 Gestion de l’ancien sprite `orbText.js`
- Aujourd’hui l’update loop appelle encore [`orbText.updateOrbTextForFrame`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/RitualOrchestrator.js#L1539).
- Ce module doit devenir :
  - soit un fallback legacy temporaire
  - soit être supprimé du runtime final
- Recommandation :
  - phase 1 : le laisser derrière un flag `legacyTextSprite = false`
  - phase 2 : retirer son appel de la boucle

## 8. Recommandations de shaders et d’intégration visuelle

### 8.1 Couplage aux couleurs vivantes de la scène
- Alimenter `OrbTextManager.update()` avec :
  - `currentState.lightColor`
  - `currentState.wireColor`
  - `ctx.bloomPass.strength`
  - `currentState.turbulence`
- Effet :
  - le texte suit la palette du rituel
  - le halo s’aligne sur le climat et le bloom

### 8.2 Fog et lisibilité
- `quote` monde :
  - peut rester légèrement soumis à la profondeur visuelle
- `chapter` / `interpretation` HUD :
  - `material.fog = false`
  - `depthWrite = false`
  - base readable sur overlay layer

### 8.3 Lensflare implicite sans flare réel
- Le glow proxy additive + bloom suffit à produire une sensation “flare” plus stable qu’un vrai lensflare.
- Recommandation :
  - pas de lensflare object natif
  - utiliser seulement glow proxy + scanline shader + bloom pass

### 8.4 Interaction avec les particules
- Le texte HUD doit rester au-dessus des particules overlay.
- Réserver :
  - texte readable : `renderOrder 24+`
  - fluid particles overlay : ordre inférieur

## 9. Plan d’implémentation détaillé

### Phase A — Baseline technique
- Ajouter `troika-three-text`.
- Ajouter des polices locales dans `public/fonts`.
- Réécrire `orbTextManager.js` selon le code ci-dessus.

### Phase B — Unification de l’autorité texte
- Instancier `OrbTextManager` avec `ctx` complet.
- Attacher le `hudRig` à la caméra.
- Désactiver `orbText.js` dans la séquence de révélation finale.

### Phase C — Suppression du HUD DOM
- Retirer `OracleOverlay` de `OracleLayout`.
- Retirer le rideau DOM.
- Utiliser `foregroundMesh` ou un veil mesh 3D pour la profondeur cinématique.

### Phase D — Interaction
- Phase minimale :
  - `Escape` ou `Enter` pour “Fermer le Cercle”
- Phase complète :
  - CTA 3D raycastable
  - `pointer-events-auto` sur le canvas seulement pendant l’état final

### Phase E — Audit et tests
- Exposer un bridge d’état dédié texte 3D.
- Stabiliser `sync()` pour VRT.
- Basculer les assertions E2E de DOM vers runtime + screenshot.

## 10. Maintien des tests E2E et VRT

### 10.1 Ce qui cassera si rien n’est prévu
- Les tests unitaires `OracleOverlay.test.tsx` deviendront obsolètes.
- Les E2E qui raisonnent via le DOM HTML ne pourront plus inspecter le texte final.
- Les VRT deviendront instables si :
  - la police vient d’un CDN
  - le layout Troika n’est pas `sync()`
  - le temps de reveal est libre

### 10.2 Nouveau contrat de test recommandé

#### Bridge d’audit texte
- Étendre `window.__ORACLE_3D_STATE__` avec :

```js
window.__ORACLE_3D_STATE__ = {
  ...window.__ORACLE_3D_STATE__,
  text3D: this.textManager.getAuditState(),
}
```

- Champs minimaux :
  - `text3D.ready`
  - `text3D.visible`
  - `text3D.revealProgress`
  - `text3D.chapter`
  - `text3D.quote`
  - `text3D.nodeCount`

#### E2E
- Attendre :

```ts
await page.waitForFunction(() => {
  const s = window['__ORACLE_3D_STATE__']
  return s?.text3D?.ready === true && s?.text3D?.revealProgress >= 0.98
})
```

- Ne plus chercher `[data-testid='oracle-overlay']`.
- Vérifier à la place :
  - absence de la quote dans le HTML
  - présence du payload dans `__ORACLE_3D_STATE__.text3D`
  - screenshot stable de la scène finale

#### VRT “Zéro Absolu”
- Imposer :
  - polices locales
  - `devicePixelRatio = 1` en mode VRT
  - temps gelé (`vrtTime`)
  - `textManager.sync()` terminé avant capture
  - reveal fixé à `1.0`
  - seed fixe
- Ajouter un mode `?vrtTextStatic=1` pour :
  - geler scanlines/shimmer
  - fixer `uTime = 0`
  - couper le drift léger si nécessaire

### 10.3 Tests unitaires à ajouter
- `orbTextManager.layout.test.js`
  - vérifie que `chapter`, `quote`, `interpretation` sont mappés vers les bons nodes
- `orbTextManager.render-contract.test.js`
  - vérifie `layers`, `renderOrder`, `transparent`, `depthWrite`, `fog`
- `oracle-text-handoff.integration.test.tsx`
  - vérifie que `Oracle3DScene` transmet tout le payload final au manager 3D via l’orchestrateur

## 11. Recommandation finale

- **Stratégie retenue** : `troika-three-text` en SDF, pas `TextGeometry`.
- **Architecture cible** : un `OrbTextManager` unique, scindé en `worldRig` et `hudRig`, exploitant les deux render layers déjà présents.
- **Suppression du DOM** : retirer `OracleOverlay` et le rideau HTML de `OracleLayout`, puis laisser `Oracle3DScene` transmettre le JSON final directement au moteur 3D.
- **Garanties VRT/E2E** : exposer un `text3D` state explicite, synchroniser le layout via `sync()`, utiliser des polices locales, et geler le temps en mode VRT.

Cette approche résout à la fois :
- le remplacement du HUD HTML
- la cohérence avec le pipeline WebGL actuel
- la lisibilité du texte long
- l’intégration esthétique avec bloom, voile, fog et palette dynamique
- la testabilité du résultat sans dépendre du DOM final
