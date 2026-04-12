# État de l'Architecture - Bilan Phase 8 (Golden Master)

## 1. Topologie du Moteur Hybride (React <-> WebGL)

### 1.1 Architecture d'ensemble

La topologie actuelle repose sur trois plans superposés dans `src/components/layout/OracleLayout.tsx` :

- `RitualWizard` reste l'orchestrateur de l'expérience principale et porte toujours la scène 3D via `Oracle3DScene`.
- un rideau DOM (`z-[45]`) sert de voile cinématique entre la révélation et la lecture.
- `OracleReadingPanel` constitue la nouvelle surface UX de lecture (`z-50`) au-dessus du canvas.

Cette composition établit bien une architecture hybride DOM/WebGL, mais avec une nuance importante : le découplage comportemental est abouti, alors que le découplage de l'état applicatif n'est pas encore totalement consolidé.

### 1.2 Le rôle exact de `InteractionBridge.ts`

`src/domain/oracleText/InteractionBridge.ts` casse le couplage fort React/WebGL en introduisant un bus d'événements mémoire, sans dépendance directe entre composants UI et objets Three.js :

- le bus est porté par un `DocumentFragment` côté navigateur, ou un `EventTarget` générique hors DOM.
- l'API est minimale et stable : `setFocus(detail)`, `clearFocus(source)`, `subscribe(callback)`.
- la charge utile `FocusEventDetail` standardise trois dimensions : `target`, `id`, `source`.
- les sources sont explicites (`html` ou `webgl`), ce qui empêche les boucles implicites de rétroaction.

La chaîne de propagation effective est la suivante :

1. `OracleReadingPanel.tsx` publie un `oracle-focus` au survol des citations.
2. `OrbTextManager` s'abonne une seule fois dans son constructeur.
3. `applyFocusState()` transforme cet événement en modulation d'opacité cible, sans appeler React ni réinjecter d'état applicatif.

Le résultat architectural est propre : React n'a aucune connaissance de la scène, et la scène n'importe aucune logique UI. Le contrat partagé se réduit à un événement sémantique.

### 1.3 Ségrégation des couches 0 et 1 pour la typographie 3D

`src/scene/modules/orbTextManager.js` met en oeuvre une typographie à deux couches optiques :

- `ORB_BASE_RENDER_LAYER = 0` : couche destinée au bloom/composer.
- `ORB_OVERLAY_RENDER_LAYER = 1` : couche destinée à la lecture nette par-dessus le composer.

Chaque bloc 3D réellement rendu aujourd'hui (`chapter`, `quote`) est dupliqué en "jumeaux optiques" :

- un mesh base layer à faible `fillOpacity`, contour plus épais et `renderOrder` bas, pour nourrir le halo.
- un mesh overlay layer à `fillOpacity` très élevée, contour fin et `renderOrder` élevé, pour conserver la lisibilité.

Le pipeline de `Oracle3DScene.tsx` respecte strictement cette séparation :

- rendu de la couche 0 via `EffectComposer` et `UnrealBloomPass`.
- `clearDepth()`.
- rendu direct de la couche 1 sans repasser dans le bloom.

Cette ségrégation évite le conflit classique entre "texte atmosphérique" et "texte lisible". Le bloom est alimenté par le proxy, jamais par la couche de lecture.

### 1.4 Conséquences techniques de cette topologie

- `depthTest = false` et `depthWrite = false` dans `orbTextManager.js` empêchent le texte oracle d'être pollué par la profondeur de la scène.
- `worldGroup` et `hudGroup` séparent déjà deux espaces sémantiques distincts.
- toutefois, `hudGroup` reste actuellement un groupe de scène, pas encore un vrai rig attaché à la caméra.
- la révélation est pilotée par interpolation (`animateReveal`) sur les opacités réelles, pendant que le focus ne modifie que les opacités cibles.

Cette combinaison est saine : la scène garde la maîtrise du temps (`update()` / `requestAnimationFrame`), tandis que React ne pousse que des intentions de focus.

## 2. Le Moteur de Gouvernance Textuelle (Phase 5 & 6)

### 2.1 `semanticTypography.ts` comme usine canonique du payload LLM

`src/scene/contracts/semanticTypography.ts` joue le rôle de compilateur sémantique du JSON Gemini vers un document textuel gouverné.

Le pipeline est en trois temps :

1. extraction robuste de champs hétérogènes via `extract(payload, paths, fallback)`.
2. normalisation de chaque bloc en `TextBlock`.
3. enrichissement systématique par :
   - `weight` (`P0` -> `P4`)
   - `surfacePolicy`
   - `diegesisMode`
   - `directives`
   - `proofPriority`

Cette usine ne se contente pas d'extraire du texte. Elle injecte une doctrine d'affichage.

### 2.2 Le moteur d'importance textuelle

`resolveDirectives()` convertit un poids dramaturgique en directives visuelles abstraites :

- `P0` : absolu, persistant, prioritaire, destiné aux fautes système.
- `P1` : grand, cinématique, contrasté.
- `P2` : médian, structurant.
- `P3` : secondaire, explicatif.
- `P4` : discret, documentaire, souvent masqué sur mobile.

Le point fort ici est la séparation entre sémantique et physique :

- `semanticTypography.ts` dit ce qu'un bloc vaut narrativement.
- `surfacePolicy.ts` décide où il doit vivre.
- `troikaMapper.ts` définit déjà comment ces directives pourraient être traduites en propriétés physiques Troika.

### 2.3 Doctrine de diégèse

La Phase 5 introduit une taxonomie utile et correctement appliquée :

- `diegetic` : appartient au monde visible du rite. Exemple : `chapter`, `imperative`, `keywords`.
- `intradiegetic` : voix interne de l'oracle, encore immergée dans le rite. Exemple : `quote`, `central_tension`, `reversal`.
- `extradiegetic` : appareil critique, preuve, explication, citations, confiance, ancrages.

Cette doctrine impose une règle architecturale saine : plus un bloc est documentaire, moins il doit être enfoui dans le monde 3D.

Le document sémantique en tire plusieurs choix cohérents :

- `quote` est intradiégétique mais autorisée en `3d_world`.
- `chapter` et `keywords` restent diégétiques et 3D.
- `explanation_long`, `citations`, `confidence`, `anchors` sont extradiégétiques et relégués vers HTML, drawer ou hidden.
- `system_alert` passe en `hybrid` en mode fail-closed, pour rendre visible une faute système sur plusieurs surfaces.

### 2.4 `surfacePolicy.ts` et le downgrade stratégique mobile

`src/domain/oracleText/surfacePolicy.ts` distribue le `SemanticOracleDocument` en cinq paniers de rendu :

- `htmlOverlay`
- `htmlDrawer`
- `webglWorld`
- `webglHud`
- `hidden`

La doctrine métier est explicite dans le code : "3D pour sentir. HTML pour comprendre. Citations pour croire."

Le downgrade mobile de Phase 6 est également cohérent :

- `quote` bascule de `3d_world` vers `html_overlay` sur mobile.
- `imperative` et `opening_image` basculent de `3d_hud` vers `html_overlay`.
- `chapter` et `keywords` restent en 3D, car ils sont courts et visuellement rentables.

Ce choix est techniquement juste : il protège la lisibilité sur petit viewport sans effondrer toute la dramaturgie visuelle.

### 2.5 Limite structurelle actuelle de l'intégration

Le routeur sémantique existe, mais il n'est pas encore l'autorité unique de tout le moteur :

- `OracleReadingPanel.tsx` consomme réellement `buildSemanticTypography()` puis `distributeSurfaces()` pour ses surfaces HTML.
- en revanche, la branche WebGL n'utilise pas encore `webglWorld` / `webglHud`.
- `RitualOrchestrator.triggerFinalRevelation()` continue d'extraire manuellement `quote` et `chapter`.
- `OrbTextManager.spawnOracle()` ne sait afficher que `quote` et `chapter`.
- `src/scene/contracts/troikaMapper.ts` formalise déjà la traduction sémantique -> physique, mais reste aujourd'hui au niveau contrat/tests.

En d'autres termes : la gouvernance textuelle est bien modélisée, mais elle n'est pas encore branchée de bout en bout jusqu'au renderer Troika.

## 3. Santé de l'Audit (CI/CD)

### 3.1 Ce que la CI valide effectivement

Le wrapper `validate-full.ps1` orchestre les contrôles suivants :

- `typecheck`
- `tests` Vitest
- `gate-knowledge`
- `knowledge-smoke`
- `build`
- `audit-runtime`
- `audit-opacity`
- `audit-opacity-sinks`

Les trois audits les plus structurants pour le moteur graphique sont bien présents :

- `scripts/audit-runtime.ps1`
- `scripts/audit-opacity.ps1`
- `scripts/audit-opacity-sinks.ps1`

### 3.2 Bilan observé sur le dépôt courant

Sur l'état réel du dépôt au **7 avril 2026**, l'exécution locale de :

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\validate-full.ps1
```

produit le run `VALID_20260407_192138` avec le statut global `ERR`.

Résultat détaillé :

- `tests`: OK
- `gate-knowledge`: OK
- `knowledge-smoke`: OK
- `audit-runtime`: OK
- `audit-opacity`: OK
- `audit-opacity-sinks`: OK
- `typecheck`: ERR
- `build`: ERR

Le défaut bloquant est unique et explicite :

- `src/components/oracleText/OracleReadingPanel.tsx(54,11): Property 'result' does not exist on type returned by useOracle()`

Conclusion factuelle : le socle d'audit runtime est vert, mais la chaîne CI "au sens strict" n'est pas 100% verte sur ce checkout précis.

### 3.3 Résilience mémoire et cycle de vie

La protection contre les fuites mémoire est crédible pour trois raisons :

- `src/scene/memory-leaks.guard.test.ts` vérifie la libération de géométries et matériaux lors des régénérations cycliques.
- `OrbTextManager.dispose()` désabonne le bridge puis `dispose()` chaque mesh Troika et le retire de son parent.
- `Oracle3DScene.tsx` annule le `requestAnimationFrame`, débranche `ResizeObserver` ou `window.resize`, détruit `composer`, `renderer`, l'arbre de scène et les globals d'audit.

La présence d'un cleanup explicite sur les listeners DOM, l'animation frame et les ressources GPU réduit fortement le risque de leak en navigation ou en remount.

### 3.4 Gardes d'opacité et prévention des boucles WebGL

La santé du pipeline visuel repose sur une discipline de "single writer" :

- `RitualOrchestrator.applyTargetsToRuntime()` centralise l'application de `wireOpacityMul`, `particlesOpacityMul` et `foregroundOpacity`.
- les valeurs appliquées sont propagées dans `ctx.appliedOpacity*`, puis relues par les sinks de rendu.
- `audit-opacity.ps1` vérifie que ces multiplicateurs existent et sont réellement consommés.
- `audit-opacity-sinks.ps1` scanne les écritures de `material.opacity`, `transparent`, `depthWrite`, `blending`, `renderOrder` et signale les écritures non reliées à l'état appliqué.

En parallèle, `Oracle3DScene.tsx` scanne les candidats de feedback render-target :

- si un objet de la couche base réutilise une texture issue du composer, il est marqué comme risque.
- le moteur bascule alors automatiquement en mode `direct`.
- les tests d'intégration d'audit vérifient que le snapshot produit un état cohérent et que la bascule protège le rendu.

Le socle de sûreté graphique est donc mature du point de vue runtime, même si la couche applicative TypeScript n'est pas encore verrouillée.

## 4. Prochaines Étapes

Avant de qualifier l'application de "Production-Ready" absolue, les dettes suivantes doivent être levées.

### 4.1 Réunifier l'autorité d'état Oracle

Le défaut le plus critique est architectural et non cosmétique :

- `OracleProvider` existe dans `src/context/OracleContext.tsx`.
- `OracleLayout.tsx` lit bien ce contexte.
- mais `RitualWizard.tsx` et `OracleReadingPanel.tsx` instancient encore `useOracle()` directement au lieu de consommer `useOracleContext()`.

Conséquences :

- duplication d'état potentielle.
- `OracleReadingPanel` est branché sur une instance locale, pas sur la même source que le layout.
- le build échoue déjà sur ce point.

Tant que cette autorité n'est pas réunifiée, le moteur hybride ne peut pas être considéré comme totalement stabilisé.

### 4.2 Brancher la gouvernance textuelle jusqu'au renderer WebGL

Aujourd'hui, la chaîne sémantique est plus avancée que son intégration runtime :

- `buildSemanticTypography()` décrit tout le document oracle.
- `distributeSurfaces()` sait router tous les blocs.
- `troikaMapper.ts` sait théoriquement traduire les directives vers Troika.
- mais `OrbTextManager` reste codé à la main pour `quote` et `chapter`.

Le prochain verrou consiste à faire du couple `semanticTypography + surfacePolicy + troikaMapper` l'unique source de vérité du texte 3D et HTML.

### 4.3 Stabiliser l'approvisionnement typographique

Deux dettes subsistent côté Troika :

- `loadFont()` dans `orbTextManager.js` ne précharge rien réellement ; il marque seulement `isReady = true`.
- la police SDF dépend d'une URL Google Fonts distante.

Pour une production robuste, il faut :

- versionner la police dans le repo ou dans les assets applicatifs.
- supprimer la dépendance réseau implicite.
- éventuellement introduire un vrai préchauffage/prefetch pour éviter tout flash au premier `sync()`.

### 4.4 Éliminer les vestiges de systèmes textuels concurrents

Le dépôt contient encore des reliquats de l'ancienne architecture :

- `src/scene/modules/orbText.js` est neutralisé en stub mais reste importé.
- `OracleOverlay.tsx` et ses tests subsistent alors que la lecture finale est désormais portée par `OracleReadingPanel`.
- `RitualWizard.tsx` conserve une copie `sr-only` du texte pour compatibilité tests.

Ces restes ne cassent pas le runtime, mais ils brouillent l'autorité fonctionnelle du système de texte.

### 4.5 Renforcer les garde-fous de contrat

Les contrats sémantiques sont bons, mais encore permissifs :

- `buildSemanticTypography(payload: any)` repose sur un payload non typé.
- il n'existe pas encore de validation runtime stricte du JSON Gemini.
- il n'y a pas de test d'intégration dédié à `OracleReadingPanel`.

Pour un niveau "absolu", il manque :

- une validation de schéma LLM en entrée.
- un test de bout en bout garantissant qu'un résultat oracle du provider arrive bien simultanément au panneau HTML et au moteur WebGL.
- un test de compilation bloquant spécifique au pipeline de lecture.

## Conclusion

La refonte Phase 3 -> Phase 8 a produit un noyau d'architecture nettement plus mature :

- découplage événementiel propre entre React et WebGL
- typographie 3D SDF lisible sous bloom
- doctrine textuelle forte par diégèse
- audit runtime/opacité/feedback déjà sérieux

Le Golden Master n'est toutefois pas encore un "terminal architecture state" au sens production absolue. Le verrou principal n'est plus graphique ; il est désormais dans la fermeture de la boucle d'autorité applicative et dans l'alignement final entre gouvernance sémantique, provider React et renderer Troika.
