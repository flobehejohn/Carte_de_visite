# Audit d'Integration E2E - Phase 8

Ce document est base exclusivement sur la lecture des fichiers locaux suivants :

- `src/App.tsx`
- `src/components/layout/OracleLayout.tsx`
- `src/hooks/useOracle.ts`
- `src/lib/geminiClient.ts`
- `src/services/zarathustraService.ts`
- `src/domain/types.ts`
- `src/domain/oracleText/finalRevealModel.ts`
- `src/components/oracle/RitualWizard.tsx`
- `src/components/oracleText/OracleReadingPanel.tsx`

## 1. Diagnostic de `src/App.tsx`

### Constats factuels

Le fichier `src/App.tsx` contient deja une logique de bypass :

```tsx
const [isE2E, setIsE2E] = useState(false);

useEffect(() => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('e2e') === 'phase8') {
      setIsE2E(true);
    }
  }
}, []);
```

Puis le rendu est :

```tsx
<OracleProvider>
  {isE2E ? <RitualWizard /> : <OracleLayout />}
</OracleProvider>
```

### Pourquoi le bypass est fragile

Le bypass n'est pas calcule avant le premier render. Il depend d'un `useEffect`, donc :

1. le premier render se fait toujours avec `isE2E === false`
2. le premier arbre monte donc `OracleLayout`
3. seulement apres le commit React, l'effet lit `window.location.search`
4. un second render remplace alors `OracleLayout` par `RitualWizard`

En clair : `?e2e=phase8` n'est pas ignore, mais il n'est pas applique de maniere synchrone.

### Point important

Dans l'etat actuel du depot, `OracleLayout` monte deja `RitualWizard` :

```tsx
return (
  <div ...>
    <RitualWizard />
    {payload && <div ... />}
    <OracleReadingPanel />
  </div>
);
```

Donc, sur le code actuel :

- le bypass `?e2e=phase8` est redondant du point de vue de la presence du wizard
- son vrai effet est surtout d'eviter le montage du shell `OracleLayout`
- le defaut principal de `App.tsx` est le caractere asynchrone du choix, pas l'absence de prise en charge de la query string

### Diagnostic final sur `App.tsx`

Le bypass echoue en tant que court-circuit strict parce qu'il est resolu apres montage via `useEffect`.  
Il ne garantit donc pas un premier render directement sur `<RitualWizard />`.

## 2. Contrat Guardian reel

### Chaine d'appel reelle

Le composant ne dispose pas d'une fonction `checkStep` dans `src/services/zarathustraService.ts`.

La chaine reelle est :

1. `RitualWizard.handleValidate()`
2. `useOracle.checkStep()` dans `src/hooks/useOracle.ts`
3. `getStepGuidance()` dans `src/services/zarathustraService.ts`
4. `geminiGenerate()` dans `src/lib/geminiClient.ts`
5. `POST /api/gemini`

### Ce que `geminiClient` exige vraiment

Pour ne pas throw dans `geminiGenerate()` :

- le mock doit repondre en HTTP `200`
- le header `content-type` doit contenir `application/json`

Le champ `ok` n'est pas lu par le client.  
Le champ `traceId` n'est pas obligatoire, mais il est repris s'il existe.  
Le champ `mode` n'est pas obligatoire, mais il est utile pour rester coherent avec le contrat applicatif.

### Ce que `getStepGuidance()` attend vraiment

`unwrapGeminiPayload()` lit d'abord `env.json`.

Donc le chemin le plus robuste est :

```json
{
  "mode": "guardian",
  "traceId": "pw_guardian_name_001",
  "json": {
    "comment": "Le seuil s'ouvre ; tu peux poursuivre sans te justifier.",
    "isSafe": true,
    "confidence": 0.91,
    "symbolic_focus": "threshold",
    "movement": "opening",
    "tone": "clear",
    "rewrite_hint": "threshold-opens"
  }
}
```

### Propriete par propriete

- `json.comment`
  - non indispensable pour eviter un throw
  - indispensable si vous voulez que la guidance affiche votre texte mocke
  - sinon le service fabrique une guidance deterministe de secours

- `json.isSafe`
  - non indispensable techniquement
  - indispensable fonctionnellement si vous voulez controler la progression
  - si absent, `buildGuardianGuidanceFromPayload()` utilise `true`

- `json.confidence`
  - optionnel
  - si absent, une valeur par defaut est injectee

- `json.symbolic_focus`, `json.movement`, `json.tone`, `json.rewrite_hint`
  - optionnels
  - utiles pour garder un rendu stable et explicite

- `ok`
  - ignore par le frontend

### Ce qu'un `500` produit reellement

Si le mock Guardian renvoie `500`, `geminiGenerate()` throw.  
Mais `getStepGuidance()` catch l'erreur et retourne une guidance de secours.

Donc :

- un `500` Guardian ne devrait pas produire l'ecran rouge final
- l'ecran rouge est plutot coherent avec un echec du chemin Oracle final

## 3. Payload Guardian parfait pour Playwright

Payload recommande, strictement compatible avec le code actuel :

```json
{
  "ok": true,
  "mode": "guardian",
  "traceId": "pw_guardian_step_name",
  "json": {
    "comment": "Le seuil s'ouvre ; tu peux poursuivre sans te justifier.",
    "isSafe": true,
    "confidence": 0.91,
    "symbolic_focus": "threshold",
    "movement": "opening",
    "tone": "clear",
    "rewrite_hint": "threshold-opens"
  }
}
```

Headers a renvoyer :

```http
content-type: application/json
```

Status a renvoyer :

```http
200
```

## 4. Contrat Oracle reel

### Chaine d'appel reelle

La chaine reelle est :

1. `RitualWizard.handleFinalDraw()`
2. `useOracle.drawFromRitual()`
3. `consultOracle()` dans `src/services/zarathustraService.ts`
4. `geminiGenerate()` dans `src/lib/geminiClient.ts`
5. `POST /api/gemini`
6. `buildOracleResult()`
7. `mapToFinalRevealModel(env || data)`

### Condition qui declenche l'ecran rouge

Dans `consultOracle()` :

```ts
const { env, payload } = unwrapGeminiPayload(r);
if (!payload) {
  throw new Error('Oracle payload missing in API response.');
}
```

Puis `useOracle.drawFromRitual()` catch cette erreur et remplit `error`, ce qui affiche l'ecran rouge.

Donc, pour eviter l'ecran rouge, le mock Oracle doit fournir un `payload` truthy selon `unwrapGeminiPayload()`.

### Ce que `unwrapGeminiPayload()` accepte

`payload` sera considere valide si :

1. `json` existe et est truthy
2. ou bien le root contient directement `comment`, `quote` ou `interpretation`
3. ou bien `text` contient un JSON parseable

Le chemin robuste pour les tests est clairement `json`.

### Ce que `buildOracleResult()` lit

Depuis `data = payload` :

- `data.quote`
- `data.interpretation`
- `data.keywords`
- `data.visual_prescription`
- `data.citations`
- `data.citation_ids`

Depuis `env` :

- `env.hermeneutic`
- `env.composition`
- `env.citationsUsed`

### Ce que `mapToFinalRevealModel()` lit

Le mapper fait :

```ts
const data = rawPayload.json || rawPayload.hermeneutic || rawPayload;
```

Puis il lit uniquement dans `data` :

- `quote`
- `chapter`
- `author`
- `central_tension`
- `reversal`
- `imperative`
- `return_axis`
- `explanation_short`
- `explanation_long`
- `prose`
- `citations`
- `citationsUsed`
- `confidence`
- `blocks`

### Consequence importante

Si vous envoyez une enveloppe avec `json`, alors `finalRevealModel` lira `json` et ignorera les champs racine `composition` et `hermeneutic` pour construire `finalReveal`.

Donc, pour un affichage robuste aujourd'hui :

- il faut remplir `json.explanation_long`
- il faut remplir `json.citations` de preference en `string[]`
- il faut remplir `json.quote`
- il faut remplir `json.chapter` et `json.author`

### Mismatch a connaitre

`FinalRevealModel` declare :

```ts
citations: string[]
blocks: any[]
```

Donc, pour le frontend actuel :

- `json.citations` doit idealement etre un tableau de chaines
- `json.blocks` doit etre un tableau

Si vous envoyez des objets de citation plus riches, les composants actuels risquent d'afficher `[object Object]` lors d'un `join()`.

## 5. Payload Oracle parfait pour Playwright

Payload recommande, strictement compatible avec le code actuel :

```json
{
  "ok": true,
  "mode": "oracle",
  "traceId": "pw_oracle_final_001",
  "json": {
    "quote": "Citation heroique de test.",
    "chapter": "REVELATION",
    "author": "Zarathoustra",
    "central_tension": "La tension centrale de test.",
    "reversal": "Le renversement de test.",
    "imperative": "Tiens ta ligne.",
    "return_axis": "Reviens a l'axe.",
    "explanation_short": "Interpretation courte de test.",
    "explanation_long": "Prose gouvernee de test. Le cycle se referme sans fantome.",
    "citations": [
      "Source A",
      "Source B"
    ],
    "confidence": 0.94,
    "blocks": []
  },
  "interpretation": "La tension centrale de test.",
  "composition": {
    "prose": "Prose gouvernee de test. Le cycle se referme sans fantome."
  },
  "hermeneutic": {
    "quote": "Citation heroique de test.",
    "chapter": "REVELATION"
  }
}
```

### Pourquoi ce payload est le plus sur

- `json` est truthy, donc `consultOracle()` ne throw pas
- `json.quote` alimente `result.quote`
- `json.explanation_long` alimente directement `finalReveal.explanation_long`
- `json.citations` alimente directement `finalReveal.citations` avec le bon type pour le frontend actuel
- `composition.prose` fournit aussi une retro-compatibilite pour `getOraclePrimaryProse()`
- `hermeneutic.quote/chapter` maintient les chemins lus par la scene 3D

### Proprietes racine indispensables en pratique

Pour ne pas afficher l'ecran rouge :

- `status = 200`
- `content-type = application/json`
- `json` truthy

Pour afficher une revelation complete et propre :

- `json.quote`
- `json.chapter`
- `json.author`
- `json.central_tension` ou `json.explanation_short`
- `json.explanation_long`
- `json.citations` en `string[]`

`ok` n'est pas lu par le frontend.  
`traceId` n'est pas obligatoire.  
`mode` n'est pas obligatoire pour le parsing pur, mais reste recommande.

## 6. Proposition de code stricte pour `src/App.tsx`

Objectif : faire en sorte que `http://localhost:5173/?e2e=phase8` decide du render des le premier passage React, sans phase intermediaire.

Proposition de remplacement direct :

```tsx
import OracleLayout from './components/layout/OracleLayout';
import RitualWizard from './components/oracle/RitualWizard';
import { OracleProvider } from './context/OracleContext';

function App() {
  const isPhase8E2E =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('e2e') === 'phase8';

  return (
    <OracleProvider>
      {isPhase8E2E ? <RitualWizard /> : <OracleLayout />}
    </OracleProvider>
  );
}

export default App;
```

### Pourquoi cette version est plus sure

- aucune attente de `useEffect`
- aucune etape intermediaire avec `isE2E = false`
- le premier render est deja le bon arbre
- le bypass devient un vrai bypass, pas un rerender correctif

## 7. Conclusion courte

Sur le code local actuel :

- le bypass `?e2e=phase8` existe deja, mais il n'est pas synchrone
- le vrai blocage Playwright vient plus probablement du contrat de mock Oracle que d'une absence totale du wizard
- pour etre stable, les mocks Playwright doivent repondre en `200 application/json`
- pour Guardian, `json.comment` et `json.isSafe` suffisent fonctionnellement
- pour Oracle, il faut un `json` truthy et, pour une revelation propre, un `json` riche avec `quote`, `chapter`, `author`, `central_tension`, `explanation_long` et `citations` en `string[]`
