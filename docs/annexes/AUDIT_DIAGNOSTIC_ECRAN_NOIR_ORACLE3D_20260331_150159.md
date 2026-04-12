# Audit diagnostic — écran noir persistant malgré tests verts

## 1. Résumé exécutif
- Diagnostic synthétique : le dépôt ne montre pas un échec principal de montage DOM ou d'absence de canvas. En navigateur réel, le canvas est attaché, dimensionné et le pipeline Three/WebGL produit des appels de rendu et des primitives, mais l'image finale reste quasi noire parce que la chaîne visuelle cumule plusieurs réglages sombres, et parce que les garde-fous actuels ne mesurent jamais la visibilité perceptible des pixels.
- Cause probable n°1 : collapse de contraste dans le pipeline runtime. La scène est initialisée avec un fond noir et un brouillard noir dans `src/components/oracle/Oracle3DScene.tsx:836-862`, les volumes ajoutent une sphère de fond opaque sombre et un glow discret dans `src/scene/modules/orbVolumes.js:146-165` et `src/scene/modules/orbVolumes.js:237-286`, les matériaux de secours restent très sombres dans `src/components/oracle/Oracle3DScene.tsx:929-935` et `src/scene/modules/orbGeometry.js:150-165`, et les presets climatiques restent globalement noirs dans `src/scene/params/ClimateController.ts:40-99`.
- Cause probable n°2 : les modes "visible-safe" et "emergency visible" ne neutralisent pas les sources structurelles de noir. `applyVisibleSafeMode` remplace des matériaux, mais ne coupe ni `scene.background`, ni `scene.fog`, ni `ReactiveBackground`, ni `OrbGlow` dans `src/components/oracle/Oracle3DScene.tsx:972-1009`. `setEmergencyVisibleMode` force `direct`, désactive les fluides, monte le probe et rapproche la caméra, mais laisse intact le fond noir, le fog et les volumes sombres dans `src/components/oracle/Oracle3DScene.tsx:1689-1718`.
- Cause probable n°3 : en mode résultat, la mise en page pousse et réduit l'orb en fonction du texte. `RitualWizard` pousse `textMetrics` vers la scène dans `src/components/oracle/RitualWizard.tsx:330-353`, puis `RitualOrchestrator` transforme ces métriques en `layoutPressure`, réduit l'échelle jusqu'au plancher `0.35`, remonte l'orb et la recule dans `src/scene/RitualOrchestrator.js:618-723`. C'est cohérent avec un fond "vivant mais invisible" derrière du texte.
- Preuve runtime décisive : en navigateur réel, après activation de `setEmergencyVisibleMode(true)`, le snapshot interne restait vert avec `warnings=[]`, `rendererCalls=13`, `triangles=3452`, `points=18620`, `lines=3528`, `probePresent=true`, `probeVisible=true`, `hasRenderableContent=true`, alors que l'analyse du screenshot composité donnait `avgLuma≈0.00394`, `nonBlackRatio≈0.01318` et `brightRatio≈0.00466`. Autrement dit : le pipeline rend bien quelque chose, mais presque rien de perceptible.
- Conclusion courte : les tests sont verts parce qu'ils certifient la cohérence structurelle du pipeline, pas sa lisibilité réelle. Le problème dominant n'est pas "pas de rendu", mais "rendu techniquement actif et perceptuellement quasi noir".

## 2. Périmètre audité
- Dépôt audité : `test_unitaire/app_llmed_wt_fix`.
- Branche et état initial du worktree : `fix/live-scene-visibility_20260330`, avec modifications préexistantes observées sur `src/components/oracle/Oracle3DScene.tsx` et `src/components/oracle/RitualWizard.tsx` via `git status --short --branch`.
- Composants UI et layout lus : `src/App.tsx:1-7`, `src/components/layout/OracleLayout.tsx:2-8`, `src/components/oracle/RitualWizard.tsx:330-685`, `src/index.css:14-70`.
- Pipeline Three/WebGL lu : `src/components/oracle/Oracle3DScene.tsx:432-1784` et `src/components/oracle/Oracle3DScene.tsx:1948-1957`.
- Orchestrateur/runtime lus : `src/scene/RitualOrchestrator.js:186-330`, `src/scene/RitualOrchestrator.js:618-849`, `src/scene/RitualOrchestrator.js:900-1075`, `src/scene/modules/orbVolumes.js:146-340`, `src/scene/modules/orbGeometry.js:150-265`, `src/scene/params/ClimateController.ts:40-99` et `src/scene/params/ClimateController.ts:332-449`.
- Tests et audits lus : `src/components/oracle/Oracle3DScene.audit.integration.test.tsx`, `src/components/oracle/Oracle3DScene.cycle.test.tsx`, `src/components/oracle/Oracle3DScene.audit.ast.test.ts`, `src/components/oracle/RitualWizard.result.test.tsx`, `src/scene/params/ClimateController.test.ts`, `src/scene/params/ClimateController.foregroundOpacityMul.test.ts`, `src/scene/render/materials/applyMaterials.integration.test.ts`, `scripts/orb-deep-audit.ts`.
- Commandes lancées :
- `git status --short --branch`
- `rg --files | rg "Oracle|RitualOrchestrator|orbVolumes|ClimateController|orbGeometry|vitest"`
- recherches ciblées `rg -n` sur `z-index`, `overflow`, `pointer-events`, `FogExp2`, `toneMappingExposure`, `probeVisible`, `hasRenderableContent`, `layoutPressure`, `backgroundStrength`, `glowIntensity`
- `npm run typecheck` : vert
- `npx vitest run src/components/oracle/Oracle3DScene.audit.integration.test.tsx src/components/oracle/Oracle3DScene.audit.ast.test.ts src/components/oracle/Oracle3DScene.cycle.test.tsx src/components/oracle/RitualWizard.result.test.tsx` : 16 tests verts
- inspection navigateur réel contre `npm run dev:web`, avec appels console à `window.__ORB_AUDIT__`, `document.elementsFromPoint(...)`, mesures de tailles effectives et analyse de screenshots composités

## 3. Reconstitution du pipeline de rendu
- Chaîne complète reconstituée :
- `src/App.tsx:1-7` monte `OracleLayout`.
- `src/components/layout/OracleLayout.tsx:6-8` monte un `main` `w-full h-full bg-black overflow-hidden` et délègue tout à `RitualWizard`.
- `src/components/oracle/RitualWizard.tsx:388-397` crée `orbital-container`, place `zone-oracle-bg absolute inset-0 z-0`, puis monte `Oracle3DSceneMemo`.
- `src/components/oracle/RitualWizard.tsx:399-557` ajoute les overlays texte `orbital-top` et `orbital-bottom` en `z-10`.
- `src/components/oracle/Oracle3DScene.tsx:836-899` crée `scene`, `camera`, `renderer`, `RenderPass`, `UnrealBloomPass`, `EffectComposer`.
- `src/components/oracle/Oracle3DScene.tsx:969-1015` instancie `RitualOrchestrator` puis lance `initRitual`.
- `src/scene/RitualOrchestrator.js:256-323` initialise `ClimateController`, lights, volumes, géométrie, foreground veil, puis réinitialise l'état sur une base très sombre.
- `src/scene/RitualOrchestrator.js:618-723` projette `textMetrics` et `textLength` dans le positionnement de l'orb.
- `src/scene/RitualOrchestrator.js:742-849` applique fog, bloom, volume, vignette et opacités au runtime.
- `src/components/oracle/Oracle3DScene.tsx:1758-1784` rend la base puis l'overlay, soit via composer+bloom, soit en direct.
- `src/components/oracle/Oracle3DScene.tsx:1948-1957` expose le root React de la scène en `absolute inset-0 w-full h-full z-0 pointer-events-none`.
- Points de fragilité identifiés :
- Fragilité layout : la scène dépend du couple `orbital-container` / `zone-oracle-bg` / overlays `z-10` défini dans `src/index.css:20-59` et `src/components/oracle/RitualWizard.tsx:388-557`.
- Fragilité perceptive : la chaîne de noir commence dans le CSS global `src/index.css:14-16`, est renforcée par le gradient de `zone-oracle-bg` dans `src/index.css:32-38`, puis par le fond/brouillard/volumes côté Three.
- Fragilité résultat : `ResizeObserver` alimente `textMetrics` dans `src/components/oracle/RitualWizard.tsx:341-348`, ce qui modifie ensuite `orbScale`, `orbYOffset` et `orbZOffset` dans `src/scene/RitualOrchestrator.js:624-723`.
- Fragilité audit : le bridge expose un snapshot riche dans `src/components/oracle/Oracle3DScene.tsx:1196-1646`, mais ce snapshot s'arrête aux compteurs internes et au DOM, sans oracle perceptif.
- Ce qui est prouvé par les tests :
- l'audit bridge expose `snapshot`, `setRenderMode`, `setVisibleSafeMode`, `setEmergencyVisibleMode` et les champs attendus dans `src/components/oracle/Oracle3DScene.audit.integration.test.tsx:264-338`
- la structure source contient `sceneStats`, `dom` et le root `z-0 pointer-events-none` dans `src/components/oracle/Oracle3DScene.audit.ast.test.ts:211-219`
- le rendu de `RitualWizard` côté tests de résultat affiche correctement les panneaux texte, mais avec une scène 3D entièrement mockée en simple `div` dans `src/components/oracle/RitualWizard.result.test.tsx:17-19`
- Ce qui est seulement supposé aujourd'hui :
- qu'un objet compté comme drawable est perceptible à l'écran
- qu'un `probeVisible=true` implique une vraie visibilité humaine
- qu'un `warnings=[]` implique une image satisfaisante
- que le mode visible-safe corrige effectivement un problème de lisibilité
- Ce qui n'est pas testé du tout :
- la luminance minimale de l'image finale
- la proportion de pixels non noirs du canvas ou de la page compositée
- le contraste réel de l'orb ou du probe visible-safe
- l'effet de `textMetrics` longs sur la taille et la position de l'orb
- l'écart entre JSDOM/mocks et navigateur réel GPU/compositor

## 4. Ce que les tests prouvent réellement

| Test / fichier | Ce qu'il garantit vraiment | Ce qu'il ne garantit pas | Risque de faux sentiment de sécurité | Sévérité | Priorité |
| --- | --- | --- | --- | --- | --- |
| `src/components/oracle/Oracle3DScene.audit.integration.test.tsx` | Contrat du bridge d'audit, bascule des modes, présence des champs `sceneStats` et `dom`, détection logique du feedback risk sous mocks. Preuves : mocks Three `:11-145`, `requestAnimationFrame` stub `:219`, assertions `:264-338`. | Aucun pixel réel, aucun GPU réel, aucune boucle RAF réelle, aucune preuve que l'image est visible, aucune exigence que `warnings` soit vide hors `render-target-feedback-risk`. | Très élevé : donne l'impression que le runtime est "cohérent" alors que le navigateur peut rester quasi noir. | Critique | P1 |
| `src/components/oracle/Oracle3DScene.cycle.test.tsx` | Réinitialisation et ressemis du cycle rituel sous environnement mocké. Preuves : mock Three `:13-123`, RAF stub `:142`, assertions `:168-249`. | Ni framing caméra, ni luminance, ni composition DOM/canvas, ni visibilité du résultat. | Élevé : vert sur la logique de cycle, muet sur la visibilité. | Haute | P1 |
| `src/components/oracle/Oracle3DScene.audit.ast.test.ts` | Verrouille la structure source attendue et certains littéraux critiques. Preuves : `findPropertyAssignment` `:129`, assertions `:211-219`. | Ne garantit rien sur l'exécution réelle, le CSS calculé, WebGL, le compositing ou l'image finale. | Élevé : une structure correcte peut produire un écran noir parfaitement valide pour ce test. | Haute | P1 |
| `src/components/oracle/RitualWizard.result.test.tsx` | La prose, les transitions et le flux UI texte fonctionnent. Preuves : mock de la scène `:17-19`, mock `framer-motion` `:21-46`, mock `ResizeObserver` `:135-138`, assertions `:197-303`. | Zéro garantie sur la scène 3D, puisque `Oracle3DScene` est remplacé par `<div data-testid=\"oracle-scene\" />`. | Très élevé : le scénario utilisateur final paraît validé alors que le fond WebGL n'est jamais exécuté. | Critique | P1 |
| `src/scene/params/ClimateController.test.ts` et `src/scene/params/ClimateController.foregroundOpacityMul.test.ts` | Les valeurs restent dans des fourchettes numériques considérées "sûres". | Aucune preuve que ces fourchettes sont visuellement suffisantes en contexte noir sur noir. | Moyen à élevé : une plage "safe" peut rester trop sombre à l'écran. | Moyenne | P2 |
| `src/scene/render/materials/applyMaterials.integration.test.ts` | Discipline d'écriture sur les flags/opacités matériaux. | Aucune preuve sur la perception, le contraste, l'effet combiné avec fog/background/bloom. | Moyen. | Moyenne | P2 |
| `scripts/orb-deep-audit.ts` | Smoke test navigateur avec snapshots, warnings et `pageErrors`. Preuves : capture snapshots `:118-119`, verdict `:175-176`. | Pas de screenshot diff, pas de seuil de luminance, pas d'assertion sur pixels visibles. | Très élevé : un run peut finir `PASS` avec une image quasi noire mais sans erreurs JS. | Critique | P1 |

- `vitest.config.ts:23` fixe `environment: 'node'`. Ce point suffit à expliquer qu'une grande partie de la suite n'exerce pas un navigateur réel.
- `npm run typecheck` vert prouve seulement la cohérence TypeScript. Il ne porte aucun signal sur la visibilité de la scène.

## 5. Faux positifs identifiés
- Faux positif 1 : `probeVisible` signifie seulement "flag `.visible` non faux".
- Preuve : `collectSceneStats` positionne `probeVisible = obj.visible !== false` dans `src/components/oracle/Oracle3DScene.tsx:513-517`.
- Pourquoi c'est trompeur : ce signal ne teste ni la luminance, ni le contraste, ni l'occlusion, ni la taille écran, ni la position perceptible du probe.
- Impact réel : `probeVisible=true` peut coexister avec un écran perçu comme noir. C'est exactement ce qui a été observé en navigateur réel avec `setEmergencyVisibleMode(true)`.
- Sévérité : critique.

- Faux positif 2 : `hasRenderableContent` assimile draw calls et drawables à de la visibilité humaine.
- Preuve : `hasRenderableContent` vaut vrai si `rendererCalls > 0 || primitiveCount > 0 || totalVisibleDrawablesExcludingProbe > 0` dans `src/components/oracle/Oracle3DScene.tsx:617-620`.
- Pourquoi c'est trompeur : un fond sphérique noir, des passes sombres, un glow très faible ou un objet hors saillance satisfont cette condition.
- Impact réel : le snapshot peut afficher `hasRenderableContent=true` alors que la luminance moyenne reste proche de zéro.
- Sévérité : critique.

- Faux positif 3 : l'absence de warnings ne couvre pas la perceptibilité.
- Preuve : les warnings du snapshot ne portent que sur les erreurs de contexte, feedback risk, bornes numériques, draw calls, primitives et drawables dans `src/components/oracle/Oracle3DScene.tsx:1196-1651`.
- Pourquoi c'est trompeur : aucun warning n'est ajouté si l'image est simplement trop sombre.
- Impact réel : `warnings=[]` donne une impression de santé visuelle alors qu'il n'existe ni test de luminance ni seuil de contraste.
- Sévérité : critique.

- Faux positif 4 : `rendererCalls > 0` et `triangles > 0` prouvent une activité GPU, pas une image lisible.
- Preuve : `rendererCalls<=0` et `no rendered primitives yet` ne sont signalés qu'en-dessous de zéro draw call ou zéro primitive dans `src/components/oracle/Oracle3DScene.tsx:1539-1554`.
- Pourquoi c'est trompeur : les compteurs sont satisfaits par la sphère de fond `ReactiveBackground`, par le glow plane `OrbGlow`, par des passes overlay, ou par un probe minuscule.
- Impact réel : des statistiques "riches" masquent un rendu noir sur noir.
- Sévérité : critique.

- Faux positif 5 : le compteur de drawables visibles compte le scene graph, pas les pixels visibles.
- Preuve : `collectSceneStats` incrémente les drawables dès qu'un objet drawable est traversé dans les couches concernées, sans test d'opacité utile, de frustum perceptif ni de couverture écran, dans `src/components/oracle/Oracle3DScene.tsx:493-621`.
- Pourquoi c'est trompeur : un objet peut être présent, activé, dans la bonne layer, et néanmoins insignifiant visuellement.
- Impact réel : les compteurs de base/overlay permettent des snapshots "cohérents" mais pas une image visible.
- Sévérité : haute.

- Faux positif 6 : le test d'intégration Oracle3DScene tourne sur mocks Three/WebGL.
- Preuve : `vi.mock('three', ...)` dans `src/components/oracle/Oracle3DScene.audit.integration.test.tsx:11-145` et `requestAnimationFrame` stubbé par `vi.fn(() => 1)` dans `src/components/oracle/Oracle3DScene.audit.integration.test.tsx:219`.
- Pourquoi c'est trompeur : aucun navigateur réel, aucune rasterisation réelle, aucune interaction avec le compositor, aucune variation GPU/pixel ratio/color management.
- Impact réel : un test peut être vert alors qu'un vrai navigateur affiche un rendu quasi noir.
- Sévérité : critique.

- Faux positif 7 : le test cycle passe sans boucle d'animation réelle.
- Preuve : `requestAnimationFrame` est stubbé dans `src/components/oracle/Oracle3DScene.cycle.test.tsx:142-143`.
- Pourquoi c'est trompeur : le fait qu'une API de reset ou seed fonctionne ne prouve pas que les frames finales sont perceptibles.
- Impact réel : la scène peut rester sombre malgré un cycle "validé".
- Sévérité : haute.

- Faux positif 8 : le test AST verrouille un contrat textuel, pas le résultat.
- Preuve : `src/components/oracle/Oracle3DScene.audit.ast.test.ts:211-219` vérifie la présence de `sceneStats`, `dom` et `z-0 pointer-events-none`.
- Pourquoi c'est trompeur : un littéral correct ne garantit ni stacking effectif, ni visibilité, ni rendu.
- Impact réel : le dépôt peut passer un audit AST tout en restant noir à l'écran.
- Sévérité : haute.

- Faux positif 9 : le test `RitualWizard.result` valide la page résultat avec une scène 3D entièrement retirée.
- Preuve : `Oracle3DScene` est mocké par un `div` dans `src/components/oracle/RitualWizard.result.test.tsx:17-19`.
- Pourquoi c'est trompeur : le flux UX le plus visible est certifié sans aucun WebGL réel.
- Impact réel : faux sentiment de sécurité maximal sur le scénario utilisateur critique.
- Sévérité : critique.

- Faux positif 10 : `scripts/orb-deep-audit.ts` peut conclure `PASS` sur un écran quasi noir.
- Preuve : le verdict dépend de `runStatus`, `warnings.includes('webgl context lost')` et `pageErrors.length` dans `scripts/orb-deep-audit.ts:175-176`.
- Pourquoi c'est trompeur : aucune comparaison d'image, aucun histogramme, aucune mesure de luminance.
- Impact réel : un audit navigateur peut être "vert" alors que le problème visuel réel persiste.
- Sévérité : critique.

- Faux positif 11 : le snapshot DOM complet n'implique pas une scène visible.
- Preuve : le snapshot expose `rootRect`, `containerRect`, `canvasClient`, `canvasWidth`, `canvasHeight`, `canvasAttached` dans `src/components/oracle/Oracle3DScene.tsx:1557-1612`.
- Pourquoi c'est trompeur : une boîte de rendu correcte n'est pas une preuve de contraste.
- Impact réel : le diagnostic peut conclure "pas de collapse layout" tout en ratant une image noire parfaitement dimensionnée.
- Sévérité : haute.

## 6. Analyse layout / CSS / stacking / compositing
- Constat 1 : le canvas ne semble pas collapsé dans le runtime observé.
- Preuves code : `html, body, #root` ont `width: 100%; height: 100%; background-color: #000; overflow: hidden` dans `src/index.css:14-16`. `orbital-container` impose `width: 100vw; height: 100vh` dans `src/index.css:20-29`. `main` impose `w-full h-full bg-black overflow-hidden` dans `src/components/layout/OracleLayout.tsx:6`. `RitualWizard` ajoute encore `relative isolate h-screen min-h-screen bg-black overflow-hidden` dans `src/components/oracle/RitualWizard.tsx:389`.
- Preuves runtime : le snapshot navigateur relevé contre `npm run dev:web` donnait `rootRect=1440x900`, `containerRect=1440x900`, `canvasClient=1440x900`, `canvasAttached=true`.
- Conclusion : le scénario "parent height collapse / canvas à 0px" n'est pas la cause principale sur l'état audité.

- Constat 2 : le layout produit intentionnellement un fond noir sur noir.
- Preuves : fond global noir dans `src/index.css:14-16`, gradient noir de `zone-oracle-bg` dans `src/index.css:32-38`, `main` noir dans `src/components/layout/OracleLayout.tsx:6`, `orbital-container` noir dans `src/components/oracle/RitualWizard.tsx:389`.
- Impact : même si WebGL rend quelque chose de sombre, le contraste avec le DOM parent reste extrêmement faible.

- Constat 3 : les overlays texte sont bien au-dessus de la scène, mais ils n'expliquent pas à eux seuls un écran noir permanent.
- Preuves : `orbital-top` et `orbital-bottom` sont en `relative z-10` dans `src/components/oracle/RitualWizard.tsx:399` et `src/components/oracle/RitualWizard.tsx:519`, alors que la scène est en `z-0` dans `src/components/oracle/Oracle3DScene.tsx:1948`.
- Preuves runtime : au centre de la fenêtre, `document.elementsFromPoint(innerWidth/2, innerHeight/2)` remontait `zone-oracle-bg`, `MAIN`, `#root`, `BODY`, `HTML` lors de l'état idle observé. Aucun overlay texte ne recouvrait le centre à ce moment.
- Conclusion : le stacking existe, mais il ne suffit pas à expliquer le noir mesuré au centre sur l'état observé.

- Constat 4 : il existe une incohérence CSS autour de `zone-oracle-bg`, mais elle touche surtout l'interactivité.
- Preuves : `src/index.css:32-38` déclare `.zone-oracle-bg { pointer-events: all; }`, alors que le JSX de `RitualWizard` ajoute `className="zone-oracle-bg absolute inset-0 z-0 pointer-events-none"` dans `src/components/oracle/RitualWizard.tsx:390`.
- Impact : conflit de classes réel, mais il affecte surtout la captation de pointer events, pas la luminosité.
- Conclusion : anomalie secondaire, pas cause racine probable de l'écran noir.

- Constat 5 : `contrast-guard` est utilisé mais non défini.
- Preuves : la classe apparaît dans `src/components/oracle/RitualWizard.tsx:400` et `src/components/oracle/RitualWizard.tsx:520`, mais aucune définition n'a été retrouvée dans les styles du dépôt audité.
- Impact : le système de protection de contraste textuel annoncé n'existe pas effectivement sous ce nom.
- Conclusion : cela ne rend pas la scène noire, mais cela confirme que certains signaux de "safety" sont déclaratifs plutôt qu'effectifs.

- Constat 6 : le scénario "une bande visible minuscule" reste plausible surtout en mode résultat.
- Preuves : le panneau bas résultat a `max-h-[45vh] overflow-y-auto` dans `src/components/oracle/RitualWizard.tsx:527`, et `textMetrics` remontent taille de boîte, ratio de surface et nombre de lignes vers la scène dans `src/components/oracle/RitualWizard.tsx:330-353`.
- Hypothèse : sur petit viewport ou prose longue, la combinaison overlay haut + overlay bas + orb déplacé vers le haut/arrière peut laisser à la scène une zone utile perceptible très faible.
- Niveau de confiance : moyen à élevé.

## 7. Analyse Three/WebGL/runtime
- Constat 1 : la caméra et le pipeline de rendu sont structurellement valides.
- Preuves : caméra perspective `45`, `near=0.1`, `far=100`, positionnée en `z=12` dans `src/components/oracle/Oracle3DScene.tsx:844-851`. En mode urgence, la caméra est rapprochée à `z=8` et recentrée via `lookAt(0, 0, 0)` dans `src/components/oracle/Oracle3DScene.tsx:1702-1706`. Le rendu base/overlay est correctement séquencé par layers avec `clearDepth()` dans `src/components/oracle/Oracle3DScene.tsx:1758-1784`.
- Conclusion : je n'ai pas trouvé de bug principal de caméra hors-frustum ou de layer inversée.

- Constat 2 : la scène part volontairement d'un état visuel extrêmement sombre.
- Preuves : `scene.background = new THREE.Color(0x000000)` et `scene.fog = new THREE.FogExp2(0x000000, 0.02)` dans `src/components/oracle/Oracle3DScene.tsx:836-838`, `renderer.toneMappingExposure = 1.0` dans `src/components/oracle/Oracle3DScene.tsx:861-862`, matériau de secours `MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8 })` dans `src/components/oracle/Oracle3DScene.tsx:929-935`.
- Preuves orchestrateur : état courant initial `orbScale: 0.001`, lumières à `0`, `backgroundStrength: 0`, `glowIntensity: 0`, couleurs `0x050505`, `0x000000`, `0x222222` dans `src/scene/RitualOrchestrator.js:186-215`. Reset rituel remet encore `orbScale: 0.0`, `glowIntensity: 0`, `wireOpacity: 0`, fond `0x000000`, wire `0x111111` dans `src/scene/RitualOrchestrator.js:312-323`.
- Impact : le pipeline "sain" peut démarrer noir sans qu'aucune invariant interne ne casse.

- Constat 3 : les volumes ajoutent un fond opaque sombre qui peut suffire à satisfaire les compteurs de rendu.
- Preuves : le shader de fond termine par `gl_FragColor = vec4(col, 1.0)` dans `src/scene/modules/orbVolumes.js:163-165`. Le fond `ReactiveBackground` est monté en `BackSide`, `depthWrite=false`, `depthTest=false`, `renderOrder=-10` dans `src/scene/modules/orbVolumes.js:246-260`. Les valeurs par défaut sont déjà sombres : `backgroundColor: 0x0b0b0b`, `backgroundStrength: 0.85`, `glowIntensity: 0.55` dans `src/scene/modules/orbVolumes.js:14-19`.
- Impact : une image essentiellement noire peut être "pleinement rendue" et remplir `rendererCalls`, `triangles` et `visible drawables`.

- Constat 4 : les presets climatiques restent orientés vers des valeurs visuellement basses.
- Preuves : `Cendre`, `Nuit froide` et `Aurore` utilisent des `bg` très sombres et des `fog` non négligeables dans `src/scene/params/ClimateController.ts:40-99`. `computeTargets()` remappe en plus `fog_density` vers `0.008..0.045` dans `src/scene/params/ClimateController.ts:336-347`, puis maintient `backgroundStrength` et `glowIntensity` dans des plages "safe" qui ne sont pas des garanties de lisibilité dans `src/scene/params/ClimateController.ts:373-449`.
- Impact : les tests valident des bornes numériques, mais pas leur effet perceptif en noir sur noir.

- Constat 5 : le mode visible-safe est incomplet.
- Preuves : `applyVisibleSafeMode` ne traverse que les matériaux des drawables et n'agit pas sur `scene.background`, `scene.fog`, le background volumétrique, le glow, ni l'exposition dans `src/components/oracle/Oracle3DScene.tsx:972-1009`.
- Impact : le mode censé "rendre visible" peut laisser intactes les principales sources de noir de l'image finale.

- Constat 6 : le mode urgence est lui aussi incomplet pour un diagnostic visuel.
- Preuves : `setEmergencyVisibleMode` force `direct`, désactive les fluides, active visible-safe, monte le probe et rapproche la caméra, mais ne désactive pas le fog ni les volumes de fond dans `src/components/oracle/Oracle3DScene.tsx:1689-1718`.
- Impact : si le problème principal est un collapse de contraste global, ce mode ne peut pas le corriger.

- Constat 7 : la géométrie et les wireframes peuvent être présentes sans saillance perceptible.
- Preuves : la polyhedron de base retombe sur `MeshStandardMaterial({ color: 0x222222, roughness: 0.45, metalness: 0.05 })` dans `src/scene/modules/orbGeometry.js:150-165`. Les wireframes démarrent avec `opacity: 0.0` et `opacityBase = 0` dans `src/scene/modules/orbGeometry.js:195-200`, puis leur visibilité dépend d'un seuil sur l'opacité calculée dans `src/scene/modules/orbGeometry.js:227-265`.
- Impact : "il y a de la géométrie" ne veut pas dire "elle se détache sur un fond noir".

- Constat 8 : le résultat navigateur réel confirme un problème de perceptibilité, pas de présence.
- Preuves runtime :
- état `initial` observé : `rendererCalls=1`, `triangles=1`, `hasRenderableContent=true`, `warnings=[]`, dimensions pleines, mais `avgLuma≈0.00394`
- état `visible_safe` observé : `rendererCalls=2`, `triangles=38341`, `warnings=[]`, mais `avgLuma≈0.00405`
- état `emergency_visible` observé : `rendererCalls=13`, `triangles=3452`, `points=18620`, `lines=3528`, `probePresent=true`, `probeVisible=true`, `hasRenderableContent=true`, `warnings=[]`, mais `avgLuma≈0.00394`, `nonBlackRatio≈1.32%`, `brightRatio≈0.47%`
- Conclusion : le problème reste pratiquement inchangé entre composer, visible-safe et emergency direct. Cela baisse fortement la probabilité d'un bug purement bloom/composer, et augmente fortement la probabilité d'un problème de luminance/contraste global.

## 8. Pourquoi l’écran peut rester noir malgré les signaux “verts”
- Explication générale : les signaux actuels sont des signaux de structure, pas des signaux de perception. Ils répondent à la question "y a-t-il une scène, des draw calls, des layers, des objets, un canvas, des passes et des métriques cohérentes ?" Ils ne répondent jamais à la question "un humain distingue-t-il clairement quelque chose dans l'image finale ?"

- Scénario 1, probabilité très élevée : la scène rend surtout des couches noires techniquement valides.
- Mécanisme : fond CSS noir `src/index.css:14-16`, gradient noir `src/index.css:32-38`, `scene.background` noir et fog noir `src/components/oracle/Oracle3DScene.tsx:836-838`, sphère `ReactiveBackground` opaque sombre `src/scene/modules/orbVolumes.js:146-165` et `src/scene/modules/orbVolumes.js:246-260`.
- Pourquoi tous les signaux restent verts : il y a bien des draw calls, des triangles, un scene graph cohérent et un canvas plein écran.

- Scénario 2, probabilité très élevée : le probe est techniquement visible mais perceptuellement négligeable.
- Mécanisme : `probeVisible` ne vérifie que `.visible` dans `src/components/oracle/Oracle3DScene.tsx:517`; le probe d'urgence est de taille raisonnable en monde 3D mais peut ne représenter qu'une fraction minime des pixels écran dans `src/components/oracle/Oracle3DScene.tsx:717-742`.
- Pourquoi tous les signaux restent verts : `probePresent=true` et `probeVisible=true` sont vrais même si seuls quelques pixels magenta percent dans une image presque totalement noire.

- Scénario 3, probabilité très élevée : visible-safe change les matériaux, pas le composite final dominant.
- Mécanisme : `applyVisibleSafeMode` ne retire pas fog/background/volumes dans `src/components/oracle/Oracle3DScene.tsx:972-1009`.
- Pourquoi tous les signaux restent verts : les objets restent rendus, potentiellement avec des matériaux modifiés, mais ils restent noyés dans un fond et un environnement de luminance trop faible.

- Scénario 4, probabilité élevée : le mode résultat éloigne et réduit l'orb jusqu'à un seuil perceptif trop bas.
- Mécanisme : `textMetrics` mesurés dans `src/components/oracle/RitualWizard.tsx:330-353` alimentent `layoutPressure`, puis `RitualOrchestrator` réduit à `0.46 - textRatio * 0.16 - pressScale * 0.25` avec plancher `0.35`, et décale l'orb à `y` positif et `z` négatif dans `src/scene/RitualOrchestrator.js:624-723`.
- Pourquoi tous les signaux restent verts : la scène continue à rendre un contenu réel, mais ce contenu devient trop petit, trop haut ou trop reculé pour créer une présence visuelle nette derrière le texte.

- Scénario 5, probabilité élevée : l'environnement de test ne voit pas les mêmes phénomènes que le navigateur.
- Mécanisme : Vitest tourne principalement en `node` dans `vitest.config.ts:23`, avec mocks Three/WebGL dans `src/components/oracle/Oracle3DScene.audit.integration.test.tsx:11-145` et `src/components/oracle/Oracle3DScene.cycle.test.tsx:13-123`.
- Pourquoi tous les signaux restent verts : ni JSDOM ni les mocks ne mesurent l'image GPU réelle, le color management, le compositing CSS, ni l'effet cumulatif du noir sur noir.

- Scénario 6, probabilité moyenne : la scène existe dans la bonne boîte DOM, mais l'utilisateur n'en perçoit que des traces sous les overlays.
- Mécanisme : la boîte 3D est pleine taille, mais les overlays haut et bas structurent visuellement la page, et le fond restant, déjà sombre, manque de saillance.
- Pourquoi tous les signaux restent verts : `canvasAttached`, `rootRect`, `containerRect`, `sceneStats` et `warnings` restent bons.

## 9. Causes racines probables classées

| Cause | Probabilité | Impact | Preuve | Confiance |
| --- | --- | --- | --- | --- |
| Collapse de contraste global : noir CSS + noir Three + fog noir + volumes sombres + matériaux sombres + exposition basse | Très élevée | Critique | `src/index.css:14-38`, `src/components/oracle/Oracle3DScene.tsx:836-862`, `src/components/oracle/Oracle3DScene.tsx:929-935`, `src/scene/modules/orbVolumes.js:146-165`, `src/scene/modules/orbVolumes.js:246-340`, runtime `avgLuma≈0.00394` malgré rendu actif | Haute |
| Mode visible-safe / emergency incomplet, car il ne neutralise pas les vraies sources de noir | Très élevée | Critique | `src/components/oracle/Oracle3DScene.tsx:972-1009` et `src/components/oracle/Oracle3DScene.tsx:1689-1718`, plus quasi-absence de gain de luminance entre `initial`, `visible_safe` et `emergency_visible` | Haute |
| Réduction et recul de l'orb induits par `textMetrics` / `layoutPressure` en mode résultat | Élevée | Haute | `src/components/oracle/RitualWizard.tsx:330-353` et `src/scene/RitualOrchestrator.js:618-723` | Moyenne à haute |
| Faux positifs structurels des tests et de l'audit bridge, qui valident la cohérence sans visibilité | Certaine pour expliquer l'écart tests/réalité | Critique sur le diagnostic | `vitest.config.ts:23`, `src/components/oracle/Oracle3DScene.audit.integration.test.tsx:11-145`, `src/components/oracle/RitualWizard.result.test.tsx:17-19`, `scripts/orb-deep-audit.ts:175-176` | Haute |
| Spécificités navigateur/compositor/GPU absentes des mocks | Élevée pour expliquer la non-détection par tests | Haute | même corpus de tests mockés, plus observation réelle en navigateur | Haute |
| Masquage pur par z-index, collapse hauteur ou root négatif | Faible sur l'état audité | Moyenne | snapshot DOM plein écran, pas de warning `scene root negative z-index`, centre écran non recouvert par overlay lors de l'observation idle | Haute |

## 10. Expériences complémentaires non destructives
- 1. Vérifier immédiatement la réalité du problème via le bridge d'audit.
- Commande / console :
```js
window.__ORB_AUDIT__?.snapshot()
document.querySelector('canvas')?.getBoundingClientRect()
```
- Hypothèse testée : le canvas existe, il est attaché et les compteurs sont verts.
- Rendement : maximal. Cette étape distingue tout de suite "pas de canvas" de "canvas noir".

- 2. Vérifier le stacking effectif au point central.
- Commande / console :
```js
document.elementsFromPoint(innerWidth / 2, innerHeight / 2)
  .map((el) => ({ tag: el.tagName, cls: el.className, id: el.id }))
```
- Hypothèse testée : un overlay couvre-t-il réellement la zone centrale.
- Rendement : très élevé. Permet d'écarter vite un faux coupable CSS.

- 3. Comparer snapshot normal, visible-safe et emergency visible sans toucher au code.
- Commande / console :
```js
const a = window.__ORB_AUDIT__
a.snapshot()
a.setVisibleSafeMode(true); a.snapshot()
a.setEmergencyVisibleMode(true); a.snapshot()
```
- Hypothèse testée : les garde-fous existants changent-ils réellement quelque chose de visible.
- Rendement : très élevé. Si les compteurs changent mais pas l'image, le problème est perceptif.

- 4. Neutraliser temporairement fog, fond et volumes depuis DevTools.
- Commande / console :
```js
const s = window.__ORB_ACTIVE_SCENE__
s.scene.fog && (s.scene.fog.density = 0)
s.scene.background?.set?.(0x202020)
s.scene.getObjectByName('ReactiveBackground') && (s.scene.getObjectByName('ReactiveBackground').visible = false)
s.scene.getObjectByName('OrbGlow') && (s.scene.getObjectByName('OrbGlow').visible = false)
s.renderer && (s.renderer.toneMappingExposure = 1.6)
```
- Hypothèse testée : le noir vient-il du décor/fog/volume plus que de l'absence d'orb.
- Rendement : très élevé. Si l'orb apparaît immédiatement, la cause racine est quasi confirmée.

- 5. Forcer un probe dominant pour tester la visibilité perceptive réelle.
- Commande / console :
```js
const s = window.__ORB_ACTIVE_SCENE__
const p = s.scene.getObjectByName('__DEV_VISIBLE_PROBE__')
if (p) {
  p.position.set(0, 0, 1.5)
  p.scale.setScalar(3)
  p.material.color?.set?.(0xffffff)
}
```
- Hypothèse testée : le probe actuel est-il simplement trop peu saillant.
- Rendement : élevé. Permet de distinguer "probe techniquement visible" et "probe réellement perceptible".

- 6. Rejouer un vrai état résultat long et corréler avec `textMetrics`.
- Procédure : produire un `lastResult` réel dans l'application, laisser apparaître le panneau bas, puis relever `window.__ORB_AUDIT__.snapshot().state` et les logs `[Orchestrator] layoutPressure`.
- Hypothèse testée : la prose longue déclenche-t-elle une réduction/recul excessifs de l'orb.
- Rendement : élevé sur la cause probable n°3.

- 7. Masquer temporairement les overlays dans DevTools.
- Procédure : masquer `.orbital-top` puis `.orbital-bottom` dans l'onglet Elements/CSS.
- Hypothèse testée : l'impression d'écran noir vient-elle en partie d'une scène trop faible derrière un habillage texte dominant.
- Rendement : moyen à élevé.

- 8. Mesurer la luminance à partir d'un screenshot de page, pas du seul canvas.
- Procédure : faire une capture navigateur de la page complète ou via Playwright, puis calculer histogramme, `avgLuma`, `brightRatio`, `nonBlackRatio`.
- Hypothèse testée : l'image finale compositée est-elle objectivement quasi noire.
- Rendement : très élevé. C'est l'oracle qu'il manque aujourd'hui.
- Note : lire directement le buffer du canvas peut donner un faux zéro si `preserveDrawingBuffer=false`. Le screenshot composité est plus fiable.

- 9. Vérifier la taille CSS contre backing store du canvas.
- Commande / console :
```js
const c = document.querySelector('canvas')
({ clientWidth: c?.clientWidth, clientHeight: c?.clientHeight, width: c?.width, height: c?.height, dpr: devicePixelRatio })
```
- Hypothèse testée : désalignement CSS/backing store ou faible résolution utile.
- Rendement : moyen.

- 10. Simuler petit viewport ou mobile.
- Procédure : DevTools responsive mode, puis mêmes snapshots/mesures.
- Hypothèse testée : la pression de layout et les overlays rendent la scène encore moins perceptible sur écrans plus petits.
- Rendement : moyen, mais très discriminant pour les usages réels.

## 11. Correctifs recommandés (non appliqués)
- Correction minimale
- Fichier cible : `src/components/oracle/Oracle3DScene.tsx`
- Zone exacte : `applyVisibleSafeMode` `:972-1009` et surtout `setEmergencyVisibleMode` `:1689-1718`
- Logique du changement : quand le mode urgence est activé, mémoriser puis neutraliser `scene.fog`, `scene.background`, `ReactiveBackground`, `OrbGlow`, et le voile foreground, augmenter temporairement `renderer.toneMappingExposure`, agrandir et rapprocher le probe. Au désarmement, restaurer exactement les valeurs d'origine.
- Risque : faible à moyen. C'est un correctif de diagnostic et de secours, pas un changement de direction artistique globale.
- Bénéfice : permet enfin à `emergency visible` d'être un vrai test discriminant.
- Niveau de confiance : élevé.
- Comment prouver que cela corrige vraiment : le screenshot composité doit montrer une hausse nette de `avgLuma` et de `brightRatio`, et le probe doit être immédiatement identifiable visuellement.
- Tests à ajouter ensuite : un test navigateur `emergency-visible-mode` avec seuil minimal de luminance et de pixels brillants.

- Correction robuste
- Fichiers cibles : `src/scene/RitualOrchestrator.js`, `src/scene/params/ClimateController.ts`, `src/scene/modules/orbVolumes.js`, `src/components/oracle/Oracle3DScene.tsx`
- Zones exactes : `src/scene/RitualOrchestrator.js:618-723`, `src/scene/params/ClimateController.ts:40-99`, `src/scene/params/ClimateController.ts:332-449`, `src/scene/modules/orbVolumes.js:14-19`, `src/scene/modules/orbVolumes.js:237-340`, `src/components/oracle/Oracle3DScene.tsx:836-862`, `src/components/oracle/Oracle3DScene.tsx:929-935`
- Logique du changement :
- relever le plancher de lisibilité globale, par exemple fond de scène légèrement au-dessus du noir absolu
- plafonner le fog effectif en vue résultat et réduire `backgroundStrength` lorsque le texte est dense
- empêcher `layoutPressure` de faire descendre l'orb sous une taille réellement perceptible, et limiter son recul
- rendre le matériau visible-safe franchement lumineux ou unlit au lieu d'un simple remplacement encore compatible avec un décor noir
- Risque : moyen. Cela touche la direction visuelle et l'équilibre artistique.
- Bénéfice : correction durable du noir perceptif sans dépendre d'un mode urgence.
- Niveau de confiance : élevé.
- Comment prouver que cela corrige vraiment : campagne de captures sur états `initial`, `progress`, `result`, `visible-safe`, `emergency`, avec seuils de visibilité stables, et validation sur desktop + mobile.
- Tests à ajouter ensuite : tests navigateurs de luminance et non-régression compositing, plus un scénario long-texte.

- Correction structurelle long terme
- Fichiers cibles : `scripts/orb-deep-audit.ts`, futur dossier de tests navigateur, éventuellement bridge d'audit dans `src/components/oracle/Oracle3DScene.tsx`
- Zone exacte : `scripts/orb-deep-audit.ts:118-176` pour le verdict, et extension du snapshot si l'équipe souhaite exposer des métriques de visibilité
- Logique du changement : introduire un oracle perceptif officiel. L'audit navigateur doit échouer si la page rend une image quasi noire malgré des compteurs internes verts. Ajouter histogramme, seuil de luminance, ratio de pixels non noirs, et comparaison de screenshots.
- Risque : faible à moyen. Le risque principal est l'ajustement des seuils.
- Bénéfice : supprime la classe entière de faux positifs constatée ici.
- Niveau de confiance : très élevé.
- Comment prouver que cela corrige vraiment : un build qui redevient quasi noir doit faire échouer l'audit navigateur même sans erreur JS.
- Tests à ajouter ensuite : voir section 12.

## 12. Tests manquants pour supprimer les faux positifs
- `oracle3d.visible-pixels.browser.spec.ts`
- Objectif : vérifier qu'un rendu navigateur réel contient une proportion minimale de pixels non noirs en état `initial`, `progress` et `result`.
- Niveau : E2E / visual regression.
- Oracle d'assertion : `nonBlackRatio` et `avgLuma` au-dessus d'un seuil défini par l'équipe.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : aucun test actuel ne lit l'image finale.

- `oracle3d.emergency-visible-mode.luminance.spec.ts`
- Objectif : garantir que `setEmergencyVisibleMode(true)` produit un rendu clairement perceptible.
- Niveau : E2E / browser-real.
- Oracle d'assertion : hausse minimale de luminance et présence d'une zone brillante correspondant au probe.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : ils ne vérifient que les flags `visibleSafeMode`, `renderMode`, `probePresent` et `probeVisible`.

- `oracle3d.canvas-effective-size.spec.ts`
- Objectif : vérifier que le canvas et son backing store ont une taille effective cohérente avec le viewport.
- Niveau : integration browser.
- Oracle d'assertion : `clientWidth`, `clientHeight`, `width`, `height`, `canvasAttached` et ratio DPR dans une plage saine.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : seul le snapshot expose ces champs, sans assertion de santé end-to-end.

- `oracle3d.result-layout-compositing.spec.ts`
- Objectif : valider qu'un `lastResult` long n'écrase pas la présence visuelle de l'orb.
- Niveau : E2E.
- Oracle d'assertion : après apparition du panneau résultat, la scène conserve un minimum de luminance et l'orb reste dans une zone visible du viewport.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : `RitualWizard.result.test.tsx` mocke complètement la scène 3D.

- `oracle3d.probe-contrast-threshold.spec.ts`
- Objectif : imposer un contraste minimal du probe visible-safe sur fond réel.
- Niveau : browser-real / visual.
- Oracle d'assertion : le probe doit produire un cluster de pixels au-dessus d'un seuil de luminance et de surface.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : `probeVisible` n'est aujourd'hui qu'un booléen de scene graph.

- `oracle3d.compositing-non-regression.spec.ts`
- Objectif : détecter les régressions de compositing entre scène WebGL et overlays DOM.
- Niveau : visual regression.
- Oracle d'assertion : screenshot diff perceptuel entre état de référence et build courant, avec tolérance maîtrisée.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : aucun diff d'image n'existe dans la suite courante.

- `orb-deep-audit.perceptual-gate.spec.ts`
- Objectif : transformer `scripts/orb-deep-audit.ts` en gate réelle de visibilité.
- Niveau : browser smoke + perceptual gate.
- Oracle d'assertion : échec si `warnings=[]` mais `avgLuma`, `brightRatio` ou `nonBlackRatio` restent sous les seuils.
- Pourquoi les tests actuels ne couvrent pas déjà ce cas : le script ne regarde aujourd'hui que `warnings`, `pageErrors` et `runStatus`.

## 13. Verdict final
- Cause la plus probable : le problème principal n'est pas l'absence de rendu, mais un collapse de contraste global causé par l'addition d'un décor noir, d'un fog noir, de volumes sombres, de matériaux sombres et d'un mode visible-safe qui ne neutralise pas ces éléments dominants.
- Pourquoi les tests sont verts : ils certifient correctement une architecture, des flags, des compteurs et des contrats de snapshot. Ils ne certifient jamais la visibilité perceptible de l'image finale en navigateur réel.
- Pourquoi l'écran reste noir : en runtime, le pipeline rend bien quelque chose, mais ce quelque chose reste presque entièrement dans des niveaux de luminance trop bas. Les mesures navigateur observées sont compatibles avec "rendu vivant mais imperceptible".
- Prochaine action la plus rationnelle : avant tout changement de code, reproduire en navigateur réel et neutraliser temporairement `fog`, `ReactiveBackground`, `OrbGlow` et le fond de scène via DevTools. Si l'orb apparaît immédiatement, appliquer ensuite en code le correctif minimal sur `setEmergencyVisibleMode`, puis le correctif robuste sur le plancher de luminance et la logique `layoutPressure`.
