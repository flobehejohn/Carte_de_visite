# AUDIT DIAGNOSTIC MODULES ORB RENDER CHAIN

## 1. Résumé exécutif
- `npm run typecheck`, la batterie Vitest demandée et `npm run build` passent sur l’état audité.
- Le runtime de support confirme que le mode d’urgence est réellement actif : `renderMode="direct"`, `fog.enabled=false`, `toneMappingExposure=2.2`, `probePresent=true`, `probeVisible=true`, `hasRenderableContent=true` dans `$env:TEMP\oracle_dom_probe_4174.json`.
- La cause racine la plus probable n’est plus le DOM, le canvas, le blit du `EffectComposer`, ni `orbVolumes`.
- Le fichier principal suspect est `src/scene/modules/orbGeometry.js`, non pas parce qu’il crash, mais parce qu’il ne porte aucune garantie intrinsèque de visibilité perceptible : solid mesh dépend d’un matériau injecté ailleurs, wireframes initialisés invisibles, pas de métadonnées d’audit de rendu, pas d’isolation explicite de layer, pas de garde robuste autour du bruit 4D.
- `src/scene/modules/orbClipping.js` est un faux suspect secondaire : il n’est pas importé dans la chaîne de rendu active et vise des cibles de contexte qui ne correspondent plus au runtime actuel.
- `src/scene/modules/orbFluidParticles.js` apparaît au contraire comme l’un des modules les mieux gouvernés du lot.
- `src/scene/modules/orbTextures.js` et `src/scene/modules/orbTextures.jsx` sont des doublons binaires stricts. Ce n’est pas la cause directe du noir, mais c’est une anomalie de gouvernance réelle.
- Verdict : dans le périmètre audité, le noir/invisible perçu provient le plus probablement d’une orbe techniquement présente mais sans contrat minimal de visibilité dans `orbGeometry.js`, combinée à des tests qui n’inspectent jamais la perceptibilité du shell principal.

## 2. État vérifié
- `npm run typecheck` : vert.
- `npx vitest run src/scene/modules/orbFluidParticles.contract.test.ts src/scene/modules/orbFluidParticles.exports.ast.test.ts src/scene/modules/orbFluidParticles.integration.test.ts src/scene/RitualOrchestrator.materialsFlags.guard.test.js src/components/oracle/Oracle3DScene.audit.ast.test.ts src/components/oracle/Oracle3DScene.audit.integration.test.ts src/components/oracle/Oracle3DScene.audit.integration.test.tsx src/components/oracle/Oracle3DScene.cycle.test.tsx` : vert, 8 fichiers, 24 tests.
- `npm run build` : vert, build Vite produit, avec warning de taille de chunk seulement.
- Statut runtime de support :
- snapshot d’urgence : `renderMode="direct"`, `visibleSafeMode=true`, `emergencyVisibleMode=true`, `uiWindow.fog.enabled=false`, `uiWindow.postprocess.toneMappingExposure=2.2`, `sceneStats.rendererCalls=4`, `triangles=80`, `lines=216`, `probePresent=true`, `probeVisible=true`, `hasRenderableContent=true`, `warnings=["fog missing"]`.
- Ces constats suffisent à écarter comme cause primaire le non-montage DOM, le non-blit écran et le non-fonctionnement du mode d’urgence.

## 3. Analyse hiérarchisée des causes

### 3.1 Cause racine la plus probable
- `src/scene/modules/orbGeometry.js` est le maillon actif le plus faible de la chaîne de rendu orbitale.
- Le mesh principal est créé sans contrat explicite de visibilité : pas de `frustumCulled = false`, pas de `renderOrder`, pas de `layers.set(...)`, pas de `userData.renderAuditCategory` dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `150-172`.
- Les wireframes sont créés avec `opacity: 0.0` et `userData.opacityBase = 0`, puis ne deviennent visibles que si `(op * visibilityMul) > 0.01` dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `190-265`.
- En runtime d’urgence, le décor volumétrique est coupé et le fog est nul, mais le snapshot ne remonte encore que `80` triangles et `216` lignes. Dans cet état, la scène restante est essentiellement le shell géométrique. Si l’utilisateur la perçoit encore noire/invisible, le principal suspect résiduel est la géométrie orbitale elle-même, pas l’infrastructure WebGL.
- Le matériau de secours interne du module est sombre (`MeshStandardMaterial` `0x222222`) dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `162-164`. En runtime principal, [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx) `958-970` injecte heureusement un `MeshPhysicalMaterial`, ce qui prouve surtout que `orbGeometry.js` n’assure pas lui-même sa visibilité.
- Hypothèse forte et falsifiable : `orbGeometry.js` peut produire un graphe de scène sain, des draw calls non nuls et des objets présents, tout en restant perceptuellement trop faible parce qu’aucune invariant minimale de contraste/visibilité n’est imposée au shell principal.

### 3.2 Causes contributives
- `src/scene/modules/orbLighting.js` fournit de vraies lumières, mais avec des intensités modestes par défaut : `0.9`, `0.35`, `0.15` dans [`orbLighting.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbLighting.js) `261-294`. Cela n’explique pas seul un noir total, mais cela peut laisser une orbe peu saillante si la géométrie et les matériaux n’ont pas de garde-fou perceptif.
- `src/scene/RitualOrchestrator.js` continue d’alimenter `wireOpacity`, `wireOpacityMul` et `applyMaterials()`. Les wireframes restent donc dépendants d’une chaîne d’opacité dynamique plutôt que d’une visibilité garantie.
- `src/scene/modules/orbGeometry.js` appelle `simplex.noise4d(...)` directement dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `338-340`, alors que `orbFluidParticles.js` encapsule correctement les variantes `noise4D/noise4d/noise4`. Ce n’est pas la cause du noir actuel, mais c’est une faiblesse de robustesse du module.
- L’absence totale de tests perceptuels ou de tests module-intégration sur `orbGeometry.js` a laissé passer cette classe de régression.

### 3.3 Hypothèses ouvertes
- Hypothèse moyenne : le mesh principal conserve `frustumCulled=true` implicite alors que sa géométrie est déformée par frame dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `307-349`, sans recomputation explicite de bounding volume. Cela pourrait produire des disparitions intermittentes ou angle-dépendantes du shell solide.
- Hypothèse moyenne : le matériau physique injecté par [`Oracle3DScene.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx) `958-970` reste trop dépendant des lumières externes, alors qu’aucune voie “unlit” ou assertive n’existe dans `orbGeometry.js` pour garantir un rendu minimal.
- Hypothèse faible à moyenne : le bundle réellement observé par l’utilisateur n’est pas exactement le bundle audité localement. Cette hypothèse reste ouverte tant qu’aucune capture instrumentée du navigateur final n’est corrélée au commit exact.

### 3.4 Faux coupables écartés
- DOM/canvas/blit `EffectComposer` : déjà innocentés, et compatibles avec le snapshot d’urgence en `direct` avec canvas attaché et dimensions pleines.
- `orbVolumes.js` comme cause primaire : écarté. Le module respecte `ctx.runtimeFlags?.emergencyMode` et masque `backgroundMesh`/`glowMesh` dans [`orbVolumes.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbVolumes.js) `300-307`.
- `orbClipping.js` comme cause live primaire : écarté. La recherche d’imports ne montre aucun branchement actif de ce module dans `src`.
- `orbFluidParticles.js` comme cause primaire : écarté. Le module est testé, overlay-isolé, et désactivé dans le snapshot d’urgence.
- `orbGround.js` : écarté. Le sol est désactivé par défaut.
- `lightChoreo.js` : écarté comme suspect principal. La chorégraphie est désactivée par défaut avec `enabled: false`, `mode: 'none'`.

## 4. Analyse détaillée par module

### orbGeometry.js
- Le module est activement utilisé par [`RitualOrchestrator.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/RitualOrchestrator.js) `328`, `1141`, `1146`.
- Le matériau de secours est sombre : `MeshStandardMaterial({ color: 0x222222, roughness: 0.45, metalness: 0.05 })` dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `162-164`.
- Le mesh principal n’est pas rendu “audit-safe” :
- pas de `mesh.layers.set(...)`
- pas de `mesh.renderOrder = ...`
- pas de `mesh.userData.renderAuditCategory = ...`
- pas de `mesh.frustumCulled = false`
- Les wireframes sont créés correctement comme objets, mais démarrent invisibles : `opacity: 0.0`, `opacityBase = 0`, visibilité conditionnelle dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `192-200` et `244-265`.
- Comparaison importante : `orbFluidParticles.js` fait exactement l’inverse en termes de gouvernance de rendu, avec `layers.set`, `renderOrder`, `frustumCulled = false` et `renderAuditCategory`.
- La déformation utilise directement `simplex.noise4d(...)` dans [`orbGeometry.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGeometry.js) `338-340`, sans wrapper de compatibilité.
- Conclusion module : c’est le suspect principal parce qu’il concentre le plus grand nombre de trous de contrat de visibilité tout en restant le générateur actif de l’orbe.

### orbClipping.js
- La recherche d’imports dans `src` ne remonte aucun import actif de `orbClipping.js`. Les seuls résultats concernent le fichier lui-même.
- Même isolément, le module cible des entrées de contexte qui ne correspondent plus à la géométrie courante :
- `ctx.orbMaterial`
- `ctx.orbLayers`
- `ctx.volumeState?.material`
- Or la chaîne actuelle manipule surtout `ctx.orbMesh`, `ctx.wireFrames`, `ctx.volumeState.backgroundMaterial` et `ctx.volumeState.glowMaterial`.
- Preuve : [`orbClipping.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbClipping.js) `75-82` n’applique rien aux `wireFrames`, et rien au couple `backgroundMaterial/glowMaterial`.
- Conclusion module : anomalie de gouvernance ou code mort probable, pas cause primaire de l’invisibilité live.

### orbFluidParticles.*
- Couverture existante :
- contrat public dans [`orbFluidParticles.contract.test.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbFluidParticles.contract.test.ts)
- cohérence JS/d.ts dans [`orbFluidParticles.exports.ast.test.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbFluidParticles.exports.ast.test.ts)
- intégration textuelle ciblée dans [`orbFluidParticles.integration.test.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbFluidParticles.integration.test.ts)
- Le module est structurellement bien gouverné :
- `ORB_BASE_RENDER_LAYER=0`, `ORB_OVERLAY_RENDER_LAYER=1`
- `mesh.layers.set(layer)`
- `mesh.renderOrder`
- `mesh.frustumCulled = false`
- `userData.renderAuditCategory = 'fluid-particles'`
- `excludeFromComposer` et `postprocessIsolation`
- Preuve : [`orbFluidParticles.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbFluidParticles.js) `282-301`.
- Le module encapsule aussi correctement ses variantes de bruit avec un wrapper `noise4D/noise4d/noise4`.
- Conclusion module : plutôt innocenté comme cause primaire, et plus mature que `orbGeometry.js` sur les invariants de rendu.

### orbLighting.js / lightChoreo.js
- `orbLighting.js` crée bien les lumières par défaut dans [`orbLighting.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbLighting.js) `254-296`.
- `lightChoreo.js` démarre désactivé par défaut : `enabled: false`, `mode: 'none'` dans [`lightChoreo.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/lightChoreo.js) `1-9`.
- Les intensités lumineuses sont modestes, mais elles existent réellement. Ce sont des causes contributives possibles de faible contraste, pas une cause racine suffisante d’écran noir absolu.
- Conclusion module : sain structurellement, suspect secondaire faible.

### orbGround.js
- Le module importe explicitement `./orbTextures.js`, jamais `./orbTextures.jsx`, dans [`orbGround.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGround.js) `2`.
- La config par défaut a `enabled: false` dans [`orbGround.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGround.js) `52-55`.
- `buildGround()` retourne `null` quand le sol est désactivé dans [`orbGround.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbGround.js) `181-187`.
- Conclusion module : raisonnablement innocenté.

### orbVolumes.js
- Le crash historique `buildVolume is not a function` n’est plus le problème sur l’état audité.
- Le module exporte bien `buildVolume`, `updateVolumeForFrame`, `setVolumeConfig`.
- Surtout, il respecte maintenant l’urgence globale : [`orbVolumes.js`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/scene/modules/orbVolumes.js) `303-306` masque les meshes de volume si `ctx.runtimeFlags?.emergencyMode` est vrai.
- Conclusion module : non principal dans la branche actuelle.

### orbTextures.js / orbTextures.jsx
- Les deux fichiers existent.
- Les deux ont le même hash SHA256 : `2CF6215517F37CCF5EF8AA73ACF2FDF9F4C8A869C414479BAAEE0959E9992D78`.
- Les exports et contenus inspectés sont strictement identiques.
- Les imports réels pointent vers `orbTextures.js`, pas vers `orbTextures.jsx`.
- Conclusion :
- classification : anomalie de gouvernance
- risque runtime direct actuel : faible
- risque technique global : moyen, parce que cette duplication peut diverger et rendre l’audit contradictoire plus tard

## 5. Preuves de code
- Preuve 1 : le shell principal n’a pas de contrat de visibilité robuste.
```js
162:  const material = ctx.ensureOrbMaterial
163:    ? ctx.ensureOrbMaterial()
164:    : new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.45, metalness: 0.05 });
166:  const mesh = new THREE.Mesh(geometry, material);
169:  mesh.name = 'OrbMesh';
171:  ctx.layersGroup.add(mesh);
```
- Analyse : pas de `layers.set`, `renderOrder`, `renderAuditCategory`, ni `frustumCulled=false` sur le mesh principal.

- Preuve 2 : les wireframes naissent invisibles et restent sous un seuil dynamique.
```js
192:    const wireMat = new THREE.LineBasicMaterial({
195:      opacity: 0.0,
200:    wireMat.userData.opacityBase = 0;
203:    wire.frustumCulled = false;
265:    w.visible = (op * visibilityMul) > 0.01;
```
- Analyse : pipeline vivant ne veut pas dire wireframe perceptible.

- Preuve 3 : `orbFluidParticles.js` montre le niveau de gouvernance qui manque à `orbGeometry.js`.
```js
290:  mesh.layers.set(layer);
291:  mesh.renderOrder = layer === ORB_OVERLAY_RENDER_LAYER ? 10 : 0;
292:  mesh.frustumCulled = false;
296:    renderAuditCategory: 'fluid-particles',
299:    postprocessIsolation: layer !== ORB_BASE_RENDER_LAYER,
```
- Analyse : ce module encode explicitement sa sémantique de rendu. `orbGeometry.js` ne le fait pas.

- Preuve 4 : `orbClipping.js` vise des cibles de contexte qui ne correspondent plus à la géométrie active.
```js
76:  if (ctx.orbMaterial) applyClippingToMaterial(ctx, ctx.orbMaterial);
77:  if (ctx.orbLayers) ctx.orbLayers.forEach(mesh => applyClippingToMaterial(ctx, mesh?.material));
80:  if (ctx.volumeState?.material) {
81:    applyClippingToMaterial(ctx, ctx.volumeState.material);
```
- Analyse : pas d’application à `ctx.orbMesh`, `ctx.wireFrames`, `backgroundMaterial`, `glowMaterial`.

- Preuve 5 : le runtime d’urgence est réellement actif, donc ce n’est plus un problème de pipeline DOM/WebGL final.
- Snapshot de support :
- `renderMode: "direct"`
- `uiWindow.fog.enabled: false`
- `uiWindow.postprocess.toneMappingExposure: 2.2`
- `probePresent: true`
- `probeVisible: true`
- `hasRenderableContent: true`
- `rendererCalls: 4`
- `triangles: 80`
- `lines: 216`
- Analyse : ce qui reste à incriminer est le contenu géométrique perceptible, pas le canvas ni le blit.

## 6. Pourquoi les tests actuels n’ont pas suffi
- `orbFluidParticles.*` est testé, mais ce n’est pas le module en cause principal.
- `RitualOrchestrator.materialsFlags.guard.test.js` mocke `orbGeometry.js`, `orbVolumes.js`, `orbLighting.js`, `orbGround.js`, `orbFluidParticles.js`. Il valide une garde de flags, pas le rendu géométrique réel.
- Les tests `Oracle3DScene.audit.*` et `Oracle3DScene.cycle.*` valident le bridge, les contracts, les modes et la boucle, pas la visibilité perceptible du shell généré par `orbGeometry.js`.
- Aucun test ciblé ne vérifie :
- qu’`orbGeometry.createPolyhedron()` attribue un layer explicite
- que le mesh principal est non-frustum-cullable en mode audit
- que les wireframes ont une opacité minimale perceptible en mode d’urgence
- que le shell principal a un matériau de secours visible si `ensureOrbMaterial` manque
- Résultat : les tests actuels peuvent être verts alors que l’orbe principale reste visuellement trop faible ou non auditée.

## 7. Fichier principalement concerné
- Fichier principal : `src/scene/modules/orbGeometry.js`
- Fichier secondaire 1 : `src/components/oracle/Oracle3DScene.tsx`
- Fichier secondaire 2 : `src/scene/RitualOrchestrator.js`

## 8. Correctif minimal recommandé
- Ne rien changer au DOM, au canvas ou au composer en premier.
- Priorité minimale recommandée :
- imposer dans `orbGeometry.js` un contrat de rendu explicite pour `ctx.orbMesh` identique au niveau de gouvernance déjà présent dans `orbFluidParticles.js`
- fixer explicitement `mesh.layers` sur la couche base
- fixer un `renderOrder` stable pour le shell principal
- ajouter `userData.renderAuditCategory` pour le shell et pour chaque wireframe
- couper le frustum culling du mesh principal en mode audit/urgence, ou recalculer explicitement les bounding volumes après déformation
- imposer un plancher de visibilité pour les wireframes en mode urgence, au lieu d’un démarrage à `opacityBase = 0`
- option minimale complémentaire : si `ctx.ensureOrbMaterial` n’est pas fourni, utiliser un fallback franchement visible, ou échouer explicitement en audit

## 9. Plan de crantage par tests
- Test 1 : `orbGeometry.render-contract.integration.test.ts`
- Objectif : construire un `ctx` réel minimal, appeler `createPolyhedron()` puis vérifier `mesh.layers`, `mesh.renderOrder`, `mesh.userData.renderAuditCategory`, `mesh.frustumCulled`, et les mêmes invariants pour les wireframes.

- Test 2 : `orbGeometry.emergency-visible-floor.browser.spec.ts`
- Objectif : en navigateur réel, activer `setEmergencyVisibleMode(true)` et vérifier qu’au moins un cluster de pixels du shell principal dépasse un seuil minimal de luminance/surface, indépendamment du probe.

- Test 3 : `modules-governance.import-coherence.spec.ts`
- Objectif : échouer si `orbClipping.js` reste non branché tout en étant supposé actif, ou si `orbTextures.js` et `orbTextures.jsx` divergent alors que seule la version `.js` est importée.

## 10. Niveau de confiance
- Score : 89/100
- Ce qui manque pour dépasser `95` :
- une capture pixel réelle de l’orbe principale seule, en masquant explicitement le probe d’urgence
- une instrumentation runtime confirmant l’état exact de `ctx.orbMesh.material`, `ctx.orbMesh.visible`, `ctx.orbMesh.layers.mask` et `ctx.orbMesh.frustumCulled`
- une vérification navigateur du shell principal avec volumes/fog déjà neutralisés, afin de dissocier définitivement “orbe trop faible” de “orbe masquée ailleurs”
