# Audit Deep Dive : DOM Integration & WebGL Output

## 1. Analyse de la taille et de l'intégration DOM du Canvas (CSS/Tailwind)
- `Oracle3DScene` monte un conteneur React racine en `absolute inset-0 w-full h-full z-0 pointer-events-none` puis un sous-conteneur `w-full h-full` destiné à recevoir le canvas dans [`src/components/oracle/Oracle3DScene.tsx:2157`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2157) à [`src/components/oracle/Oracle3DScene.tsx:2165`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2165).
- Le `renderer.domElement` est bien injecté dans le DOM par `containerRef.current.appendChild(renderer.domElement)` dans [`src/components/oracle/Oracle3DScene.tsx:895`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L895).
- La taille effective n'est pas laissée au hasard. `handleResize()` lit `containerRef.current.clientWidth/clientHeight`, met à jour l'aspect caméra, puis appelle `renderer.setSize(width, height)`, `composer.setSize(width, height)` et `bloomPass.setSize(width, height)` dans [`src/components/oracle/Oracle3DScene.tsx:2002`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2002) à [`src/components/oracle/Oracle3DScene.tsx:2013`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2013).
- Le parent immédiat dans `RitualWizard` garantit lui-même une boîte physique plein écran : `relative w-full h-screen min-h-screen bg-black overflow-hidden isolate`, puis la scène est placée dans `absolute inset-0 z-0 pointer-events-none` dans [`src/components/oracle/RitualWizard.tsx:389`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L389) à [`src/components/oracle/RitualWizard.tsx:401`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L401).
- Le socle CSS global ne présente pas de collapse viewport. `html`, `body` et `#root` ont `width: 100%`, `height: 100%`, `min-height: 100vh`, `overflow: hidden` dans [`src/index.css:22`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/index.css#L22) à [`src/index.css:34`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/index.css#L34).
- Aucune règle `canvas { ... }` n'est définie dans [`src/index.css`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/index.css). Le projet ne contient donc pas d'écrasement CSS explicite du canvas.
- Constat runtime vérifié en navigateur réel via Playwright sur la branche courante :
- `canvas.width = 1440`
- `canvas.height = 900`
- `canvas.clientWidth = 1440`
- `canvas.clientHeight = 900`
- `canvas.getBoundingClientRect() = 1440 x 900`
- `display = block`
- `visibility = visible`
- `opacity = 1`
- `rootRect = 1440 x 900`
- `containerRect = 1440 x 900`
- `snapshot.dom.canvasAttached = true`
- Conclusion stricte : le syndrome du canvas effondré n'est pas reproduit sur l'état audité. Le canvas physique existe, mesure le viewport, est visible et est attaché au bon conteneur.
- Point de confusion possible : `elementsFromPoint()` ne renvoie pas le canvas au centre de l'écran pendant l'audit. Ce comportement est cohérent avec `pointer-events-none` sur le root de scène dans [`src/components/oracle/Oracle3DScene.tsx:2160`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L2160). Cela affecte le hit-testing, pas la visibilité.

## 2. Analyse de la chaîne de l'EffectComposer (Blitting vers l'écran)
- Le code applicatif crée bien un composer avec un render target custom via `new EffectComposer(renderer, renderTarget)` dans [`src/components/oracle/Oracle3DScene.tsx:919`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L919) à [`src/components/oracle/Oracle3DScene.tsx:928`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L928).
- Ce point ne suffit pas à conclure à un blit manquant. La version locale de Three montre explicitement que :
- `EffectComposer.renderToScreen = true` par défaut dans [`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:100`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/EffectComposer.js#L100) à [`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:105`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/EffectComposer.js#L105).
- Le composer force `pass.renderToScreen = true` sur la dernière passe activée dans [`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:228`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/EffectComposer.js#L228) à [`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:235`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/EffectComposer.js#L235).
- Avec la chaîne actuelle `RenderPass -> UnrealBloomPass`, la dernière passe activée est `UnrealBloomPass`.
- La version locale de `UnrealBloomPass` pousse explicitement vers le framebuffer par défaut (`renderer.setRenderTarget(null)`) quand `renderToScreen` est vrai dans [`node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js:295`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js#L295) à [`node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js:302`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js#L295) puis à nouveau dans [`node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js:358`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js#L358) à [`node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js:361`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js#L361).
- Donc, dans ce dépôt, l'absence d'`OutputPass` n'implique pas une image piégée en mémoire GPU. Le dernier pass blitte bien vers l'écran.
- Second point décisif : en `emergencyVisibleMode`, le code ne dépend même plus du composer. `setEmergencyVisibleMode(true)` bascule le `renderMode` en `direct` dans [`src/components/oracle/Oracle3DScene.tsx:1918`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1918) à [`src/components/oracle/Oracle3DScene.tsx:1924`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1918), puis `animate()` appelle `renderer.setRenderTarget(null)` avant `renderDirectLayers()` dans [`src/components/oracle/Oracle3DScene.tsx:1984`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1984) à [`src/components/oracle/Oracle3DScene.tsx:1988`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1988).
- Conclusion stricte : le piège “composer qui n’écrit jamais sur le canvas” n’est pas compatible avec le code actuel, et encore moins avec le mode `direct` d'urgence.

## 3. Analyse du contexte d'empilement (Z-Index / Render Target)
- La hiérarchie DOM utile est la suivante :
- `RitualWizard` crée un parent plein écran `relative ... isolate bg-black overflow-hidden` dans [`src/components/oracle/RitualWizard.tsx:389`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L389).
- La scène 3D vit dans `absolute inset-0 z-0` dans [`src/components/oracle/RitualWizard.tsx:391`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L391).
- L'UI est dans `absolute inset-0 z-10` dans [`src/components/oracle/RitualWizard.tsx:401`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L401).
- Le `main` global reste noir dans `OracleLayout`, ce qui fixe un fond de secours sombre, mais pas une couche de recouvrement. Le fond d'un parent n'est pas peint au-dessus d'un enfant déjà rendu.
- Le root de scène dans `Oracle3DScene` n'a pas de `z-index` négatif. Le snapshot runtime confirme `rootZIndex = 0`, `parentZIndex = 0`, `rootVisibility = visible`, `canvasAttached = true`.
- L'overlay UI peut réduire la perception de la scène, mais il n'existe pas dans ces trois fichiers de couche opaque plein écran au-dessus du canvas. Les panneaux visibles utilisent `glass-clear`, donc des fonds translucides dans [`src/index.css:101`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/index.css#L101) à [`src/index.css:116`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/index.css#L116).
- `renderDirectLayers()` n'entretient pas un framebuffer noir “par erreur”. Il exécute `renderer.clear()`, puis rend la base, puis `renderer.clearDepth()`, puis rend l'overlay dans [`src/components/oracle/Oracle3DScene.tsx:1953`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1953) à [`src/components/oracle/Oracle3DScene.tsx:1969`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/Oracle3DScene.tsx#L1969).
- Dans la version locale de Three, `renderer.clear()` sans argument signifie bien `clear(color=true, depth=true, stencil=true)` dans [`node_modules/three/src/renderers/WebGLRenderer.js:942`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/src/renderers/WebGLRenderer.js#L942) à [`node_modules/three/src/renderers/WebGLRenderer.js:946`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/node_modules/three/src/renderers/WebGLRenderer.js#L946).
- Conséquence physique : si le canvas est réellement visible, `renderDirectLayers()` doit montrer au minimum la clear color et le `scene.background`.
- Constat runtime d'urgence confirmé :
- `renderMode = direct`
- `uiWindow.fog.enabled = false`
- `uiWindow.postprocess.toneMappingExposure = 2.2`
- `canvasClient = 1440 x 900`
- `canvas visibility = visible`
- `sceneStats.rendererCalls = 4`
- `sceneStats.probePresent = true`
- `sceneStats.probeVisible = true`
- `warnings = ['fog missing']`
- Conclusion stricte : dans l'état actuel de la branche, le trio `DOM plein écran + direct render + fog nul` est physiquement compatible avec une image visible. Le noir total observé en live n'est pas expliqué par ces trois fichiers.

## 4. Conclusion : La cause physique de l'invisibilité
- Conclusion principale : je ne trouve pas, dans `Oracle3DScene.tsx`, `RitualWizard.tsx` et `src/index.css`, de cause physique suffisante pour produire un canvas noir par collapse DOM, absence de blit, ou mauvais cycle de clear.
- Le canvas n'est pas effondré.
- Le canvas est attaché et visible.
- Le parent lui donne bien une surface plein écran.
- Le composer blitte bien vers l'écran quand il est utilisé.
- Le mode `direct` bypass le composer et rend explicitement dans le framebuffer par défaut.
- Le `renderer.clear()` du mode `direct` doit faire apparaître le fond si le canvas est à l'écran.
- Le fait que `emergencyVisibleMode` donne maintenant, en runtime vérifié, `fog.enabled = false`, `toneMappingExposure = 2.2`, `renderMode = direct` et un canvas `1440x900` visible signifie que l’hypothèse “le WebGL tourne mais rien n’atteint le canvas physique” ne tient plus sur cette branche.
- La cause physique la plus plausible de l’invisibilité live est donc externe à ces trois fichiers.
- Hypothèse 1, confiance élevée : l’utilisateur n’observe pas le bundle réellement audité. Indice matériel : `npm run dev:web` n’a pas pu reprendre le port `5173` pendant l’investigation car “Port 5173 is already in use”, alors qu’un `Invoke-WebRequest` direct sur `http://127.0.0.1:5173` retournait connexion refusée. Cette incohérence est compatible avec un runtime Vite/proxy/port local non sain.
- Hypothèse 2, confiance moyenne : un autre facteur hors périmètre audité continue à rendre la scène perceptuellement noire, mais pas via le DOM ou le blit. Exemple : modules de rendu amont, problème spécifique navigateur/GPU/compositor, ou session navigateur non rafraîchie.
- Formulation stricte : sur le code actuellement présent dans ces trois fichiers, la cause physique de l’invisibilité n’est ni le canvas, ni l’`EffectComposer`, ni le `clear()` du renderer direct.

## 5. Plan de correction (Snippets de code à appliquer par l'utilisateur)
- Objectif du plan : durcir l'intégration DOM/WebGL pour rendre impossibles, ou immédiatement détectables, les faux diagnostics “canvas noir par intégration”.
- Ces snippets sont des hardenings. Ils ne sont pas la preuve d’un bug actuel dans ces fichiers.

- Snippet 1 : imposer explicitement le style physique du canvas après `appendChild`
```ts
// Oracle3DScene.tsx
containerRef.current.appendChild(renderer.domElement);

Object.assign(renderer.domElement.style, {
  display: 'block',
  width: '100%',
  height: '100%',
  position: 'absolute',
  inset: '0',
});
```
- Intérêt : enlève toute ambiguïté sur le sizing CSS du canvas, même si Three change un jour son comportement par défaut.

- Snippet 2 : rendre le conteneur de rendu explicitement positionné
```tsx
// Oracle3DScene.tsx
<div
  ref={rootRef}
  className="absolute inset-0 w-full h-full z-0 pointer-events-none"
>
  <div ref={containerRef} className="relative w-full h-full overflow-hidden" />
</div>
```
- Intérêt : verrouille le repère de placement absolu du canvas.

- Snippet 3 : rendre l’écriture écran explicite côté composer
```ts
// Oracle3DScene.tsx
const composer = new EffectComposer(renderer, renderTarget);
composer.renderToScreen = true;

composer.addPass(renderScene);
composer.addPass(bloomPass);
```
- Intérêt : ce n’est pas requis avec Three actuel, mais cela supprime tout doute lors des audits futurs.

- Snippet 4 : expliciter le clear du mode direct
```ts
// Oracle3DScene.tsx
const renderDirectLayers = () => {
  renderer.setRenderTarget(null);
  renderer.clear(true, true, true);

  bloomPass.enabled = false;
  camera.layers.set(ORB_BASE_RENDER_LAYER);
  renderer.render(scene, camera);

  renderer.clearDepth();
  camera.layers.set(ORB_OVERLAY_RENDER_LAYER);
  renderer.render(scene, camera);
};
```
- Intérêt : rend le contrat “clear couleur + profondeur + stencil” incontestable à la lecture.

- Snippet 5 : ajouter une alerte d’intégration DOM dans le bridge d’audit
```ts
// Oracle3DScene.tsx snapshot()
const canvasRect = renderer.domElement?.getBoundingClientRect?.();
if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
  warnings.push('canvas-zero-sized');
}

const canvasStyle = renderer.domElement ? window.getComputedStyle(renderer.domElement) : null;
if (canvasStyle?.visibility === 'hidden' || canvasStyle?.display === 'none') {
  warnings.push('canvas-css-hidden');
}
```
- Intérêt : supprime définitivement la classe de faux positifs “renderer actif mais canvas physiquement invisible”.

- Snippet 6 : afficher la signature runtime courante pour détecter un faux serveur Vite
```ts
// Oracle3DScene.tsx
if (import.meta.env.DEV) {
  console.info('[RUNTIME_SIGNATURE]', {
    renderMode: renderModeRef.current,
    emergency: emergencyVisualStateRef.current.active,
    seed: (orchestratorRef.current as any)?.ritualDNA?.seed ?? null,
    href: window.location.href,
  });
}
```
- Intérêt : si l’utilisateur voit un écran noir mais ne retrouve pas cette signature en console, il n’est pas sur le bon runtime.
