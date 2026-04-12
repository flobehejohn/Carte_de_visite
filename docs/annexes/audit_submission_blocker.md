# Audit Médico-Légal : Blocage de l'Étape 10

## 1. La Trace d'Exécution (Du Clic à l'API)

### 1.1 Ce que fait réellement l'étape 10

Dans l'état actuel du dépôt, l'étape `X. Invocation` de [`src/components/oracle/RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L105) n'est pas une soumission finale directe.

La séquence exacte est la suivante :

1. `currentStep.id === 'question'`.
2. `currentValue` lit `formData.question` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L201)).
3. `canValidate` vaut seulement `trim().length > 0` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L207)).
4. Le bouton `Confirmer` appelle `handleValidate` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L627)).

### 1.2 `handleValidate` n'envoie pas l'oracle final

`handleValidate` fait uniquement ceci ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L222)) :

```tsx
const handleValidate = async () => {
  if (!currentStep || !canValidate) return;
  clearGuidance();
  setViewState('GUIDANCE');
  setCanProceed(false);
  setGuidanceEchoDone(false);
  setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));
  await checkStep(currentStep.id, currentValue);
};
```

Conséquence :

- un clic sur `Confirmer` ne déclenche jamais `drawFromRitual`.
- il déclenche uniquement `checkStep('question', currentValue)`.

### 1.3 Le hook `useOracle.ts` confirme cette topologie

Dans [`src/hooks/useOracle.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/hooks/useOracle.ts#L22), la soumission finale ne passe que par `drawFromRitual` :

```ts
const drawFromRitual = useCallback(
  async (ritual: RitualInput, opts?: DrawOptions) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setLastResult(null);

    try {
      const result = await consultOracle(ritual, opts);
      if (requestId !== requestIdRef.current) return;
      setLastResult(result);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Erreur silencieuse.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  },
  [],
);
```

Dans le même hook, `checkStep` ne fait qu'une requête de guidance ([`useOracle.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/hooks/useOracle.ts#L44)) :

```ts
const checkStep = useCallback(
  async (step: string, value: string): Promise<boolean> => {
    if (!value || value.trim().length === 0) return true;

    setGuidanceLoading(true);
    setLastGuidance(null);

    try {
      const result = await getStepGuidance(step, value);
      const msg = String(result.comment ?? '').trim();
      setLastGuidance(msg.length > 0 ? msg : 'Le seuil reste ouvert.');
      return Boolean(result.isSafe);
    } catch (e: any) {
      setLastGuidance('Le seuil reste ouvert.');
      return true;
    } finally {
      setGuidanceLoading(false);
    }
  },
  [],
);
```

Il n'existe pas de `submitRitual` séparé. La seule porte de sortie finale est `drawFromRitual`.

### 1.4 Où part réellement la requête POST finale

La requête HTTP n'est envoyée qu'à partir de `consultOracle()` dans [`src/services/zarathustraService.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/services/zarathustraService.ts#L681), qui appelle `geminiGenerate()` avec `mode: 'oracle'`.

Ensuite, [`src/lib/geminiClient.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/lib/geminiClient.ts#L183) exécute le `fetch('/api/gemini')` :

```ts
r = await fetch(API_PATH, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
  signal: opts.signal,
});
```

Donc :

- pas de `drawFromRitual`
- pas de `consultOracle`
- pas de `geminiGenerate(mode: 'oracle')`
- pas de `POST /api/gemini` final

### 1.5 La vraie chaîne de l'étape 10

Le flux complet est donc :

1. Saisie dans le champ `question`.
2. `Confirmer` -> `handleValidate()`.
3. `handleValidate()` -> `checkStep('question', value)`.
4. `checkStep()` -> `getStepGuidance()` -> `geminiGenerate(mode: 'guardian')`.
5. Le composant passe en `viewState === 'GUIDANCE'`.
6. Le bouton final `Invoquer Zarathoustra` n'apparaît que si `canProceed === true` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L641)).
7. `Invoquer Zarathoustra` -> `handleNextStep()`.
8. Si `stage === 10`, `handleNextStep()` appelle `handleFinalDraw()` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L232)).
9. `handleFinalDraw()` appelle enfin `drawFromRitual()` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L244)).

### 1.6 Pourquoi la scène "reste figée"

Le ressenti de blocage vient aussi du fait que la scène 3D ne réagit qu'à `loading` du tirage final, pas à `guidanceLoading`.

Dans [`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L392), `Oracle3DScene` reçoit :

```tsx
progress={lastResult ? 1.0 : loading ? 0.85 : (stage / 10) * 0.8}
```

Pendant `checkStep()` :

- `guidanceLoading` passe à `true`
- `loading` reste `false`

Donc la scène reste visuellement sur la progression d'arrière-plan de l'étape 10, ce qui donne l'impression d'un freeze alors que l'UI attend encore la phase `GUIDANCE`.

## 2. Identification du Goulet d'Étranglement (Le Coupable)

### 2.1 Le coupable principal

Le blocage ne vient ni d'une garde cachée dans `useOracle.ts`, ni d'un champ facultatif manquant.

Le coupable exact est le découpage du flux final en **deux portes successives** :

1. `Confirmer` n'appelle que `handleValidate()`, donc seulement la guidance.
2. la soumission finale est bloquée derrière `viewState === 'GUIDANCE' && canProceed`.

La condition bloquante exacte est donc :

```tsx
{viewState === 'GUIDANCE' && canProceed && (
  <motion.button onClick={handleNextStep}>
    {stage < 10 ? 'Continuer le voyage' : 'Invoquer Zarathoustra'}
  </motion.button>
)}
```

Et `canProceed` est initialisé à `false` dans `handleValidate()`.

### 2.2 Pourquoi `canProceed` reste fermé

`canProceed` n'est pas piloté par la réussite de l'appel final. Il est piloté par l'UI de guidance.

Le mécanisme est le suivant :

- si `guidanceLoading` est `true`, `canProceed` est forcé à `false` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L304)).
- si `guidanceEcho` est vide, `canProceed` passe immédiatement à `true`.
- si `guidanceEcho` est non vide, `canProceed` n'est libéré qu'à la fin de l'animation `Typewriter`, via `onComplete`.

Autrement dit :

- le retour de `checkStep()` n'est pas utilisé pour ouvrir la porte finale.
- la disponibilité du bouton `Invoquer Zarathoustra` dépend d'une animation visuelle, pas du résultat métier.

C'est la source directe du "silent failure".

### 2.3 Ce qui n'est pas le coupable

#### A. Pas de `validationWarning`

Il n'existe aucune variable `validationWarning` dans `RitualWizard.tsx`.

#### B. Pas de check strict sur `questionText`

La seule validation locale est :

```ts
const canValidate = Boolean(String(currentValue ?? '').trim().length > 0);
```

Donc :

- pas de regex
- pas de longueur minimale spécifique
- pas de test spécial sur `questionText`

#### C. Pas d'early return dans `drawFromRitual`

Une fois `handleFinalDraw()` exécuté, `drawFromRitual()` appellera toujours `consultOracle()`, puis `fetch('/api/gemini')`.  
Il n'y a pas de garde du style "si un champ facultatif manque, ne rien faire".

### 2.4 Le point important sur le `textarea`

L'hypothèse "l'étape 10 est un `textarea`" est fausse dans le flux actuel.

Dans le `RitualWizard` en production :

- l'étape 10 est rendue avec un `<input type="text">` ([`RitualWizard.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualWizard.tsx#L611)).
- le `textarea` existe seulement dans l'ancien [`src/components/oracle/RitualForm.tsx`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/src/components/oracle/RitualForm.tsx#L76), qui n'est pas le Golden Path actuel.

Donc le binding de valeur actuel de l'étape 10 est correct pour un `input` :

```tsx
value={formData[currentStep.id] || ''}
onChange={(e) => updateField(currentStep.id, e.target.value)}
onKeyDown={(e) =>
  e.key === 'Enter' && canValidate && handleValidate()
}
```

Il n'y a pas de bug de binding évident côté source pour le clic utilisateur.

### 2.5 Ce que fait réellement Playwright

Le test E2E mentionné ne clique pas `Confirmer` sur les étapes textuelles.  
Dans [`tests/e2e/oracle-10-steps.spec.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/tests/e2e/oracle-10-steps.spec.ts#L82), il fait :

```ts
await textInput.fill(`Réponse à l'étape ${i}`);
await textInput.press('Enter');
```

Puis, à l'étape 10 seulement, il attend :

```ts
const invokeBtn = page.locator('button', {
  hasText: /Invoquer Zarathoustra/i,
});
await expect(invokeBtn).toBeVisible({ timeout: 20000 });
await invokeBtn.click();
```

Le test lui-même encode donc déjà le fait que :

- `Enter` ou `Confirmer` ne suffit pas
- il faut une seconde action `Invoquer`

Enfin, son mock réseau distingue explicitement la requête finale en cherchant `climateSnapshot` ou `"mode":"oracle"` ([`oracle-10-steps.spec.ts`](C:/ATLAS/INBOX/dev/R_D/carte_de_visite/test_unitaire/app_llmed_wt_fix/tests/e2e/oracle-10-steps.spec.ts#L23)).  
Cela confirme que le `POST` final attendu n'est pas celui de `checkStep()`.

### 2.6 Fragilité secondaire : absence de timeout sur la guidance

Il existe une seconde fragilité réelle :

- `checkStep()` attend `getStepGuidance()`
- `getStepGuidance()` appelle `geminiGenerate()`
- `geminiGenerate()` supporte un `signal`, mais aucun timeout n'est injecté par `useOracle.ts`

Donc si la requête `guardian` pend :

- `guidanceLoading` reste `true`
- `canProceed` reste `false`
- `Invoquer Zarathoustra` n'apparaît jamais
- la requête finale `oracle` n'est jamais émise

Ce n'est pas la cause structurelle principale, mais c'est un multiplicateur de blocage silencieux.

## 3. Options de Remédiation

### Option A : faire de `Confirmer` le vrai submit final à l'étape 10

C'est l'option la plus directe si l'intention produit est :  
"À l'étape 10, le clic sur `Confirmer` doit lancer l'oracle."

Code proposé dans `RitualWizard.tsx` :

```tsx
const handleValidate = async () => {
  if (!currentStep || !canValidate) return;

  if (currentStep.id === 'question') {
    handleFinalDraw();
    return;
  }

  clearGuidance();
  setViewState('GUIDANCE');
  setCanProceed(false);
  setGuidanceEchoDone(false);
  setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));
  await checkStep(currentStep.id, currentValue);
};
```

Effet :

- un seul clic sur `Confirmer` à l'étape 10
- `drawFromRitual()` est appelé immédiatement
- le `POST /api/gemini` final part sans seconde CTA

Trade-off :

- la guidance de seuil n'est plus jouée sur la question finale

### Option B : garder la guidance, mais auto-enchaîner vers l'oracle

Si la guidance de l'étape 10 doit rester visible, il faut enchaîner automatiquement vers `handleFinalDraw()` une fois `checkStep()` revenu.

Code proposé :

```tsx
const handleValidate = async () => {
  if (!currentStep || !canValidate) return;

  clearGuidance();
  setViewState('GUIDANCE');
  setCanProceed(false);
  setGuidanceEchoDone(false);
  setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));

  const isSafe = await checkStep(currentStep.id, currentValue);

  if (currentStep.id === 'question' && isSafe) {
    handleFinalDraw();
  }
};
```

Variante si l'on veut laisser la guidance s'afficher brièvement :

```tsx
if (currentStep.id === 'question' && isSafe) {
  window.setTimeout(() => handleFinalDraw(), 1200);
}
```

Effet :

- l'étape 10 reste gouvernée
- mais il n'y a plus de second bouton caché

### Option C : conserver le double clic, mais supprimer le verrou silencieux `canProceed`

Si l'UX à deux temps est volontaire, le problème vient alors du fait que `canProceed` dépend du `Typewriter`.

Code proposé :

```tsx
const handleValidate = async () => {
  if (!currentStep || !canValidate) return;

  clearGuidance();
  setViewState('GUIDANCE');
  setCanProceed(false);
  setGuidanceEchoDone(false);
  setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));

  await checkStep(currentStep.id, currentValue);

  if (currentStep.id === 'question') {
    setGuidanceEchoDone(true);
    setCanProceed(true);
  }
};
```

Ou, plus explicitement dans l'effet :

```tsx
useEffect(() => {
  if (viewState !== 'GUIDANCE') return;

  if (guidanceLoading) {
    setCanProceed(false);
    setGuidanceEchoDone(false);
    return;
  }

  if (currentStep?.id === 'question') {
    setGuidanceEchoDone(true);
    setCanProceed(true);
    return;
  }

  if (!guidanceEcho) {
    setGuidanceEchoDone(true);
    setCanProceed(true);
  }
}, [viewState, guidanceLoading, guidanceEcho, currentStep?.id]);
```

Effet :

- la porte finale n'est plus tenue par une animation cosmétique
- l'étape 10 reste en deux temps, mais n'est plus perçue comme bloquée

### Option D : ajouter un timeout sur la guidance pour éviter un gel infini

Pour éviter qu'une requête `guardian` pendante ne bloque définitivement le Golden Path, il faut injecter un `AbortController`.

Code proposé dans `useOracle.ts` :

```ts
const checkStep = useCallback(
  async (step: string, value: string): Promise<boolean> => {
    if (!value || value.trim().length === 0) return true;

    setGuidanceLoading(true);
    setLastGuidance(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const result = await getStepGuidance(step, value, {
        signal: controller.signal,
      } as any);
      const msg = String(result.comment ?? '').trim();
      setLastGuidance(msg.length > 0 ? msg : 'Le seuil reste ouvert.');
      return Boolean(result.isSafe);
    } catch {
      setLastGuidance('Le seuil reste ouvert.');
      return true;
    } finally {
      window.clearTimeout(timeoutId);
      setGuidanceLoading(false);
    }
  },
  [],
);
```

Et côté service :

```ts
export async function getStepGuidance(
  step: string,
  value: string,
  opts?: { debug?: boolean; signal?: AbortSignal },
): Promise<GuardianGuidance> {
  // ...
  const r = await geminiGenerate(prompt, {
    mode: 'guardian',
    step: stepA,
    value: valueA,
    expectJson: true,
    temperature: 0.2,
    maxOutputTokens: 500,
    signal: opts?.signal,
  });
  // ...
}
```

Effet :

- plus de blocage infini sur la guidance
- le wizard retombe sur son fallback au lieu d'attendre sans fin

### Option E : corriger le test Playwright pour refléter le vrai flux

Le test actuel est plus fragile qu'il ne devrait, car il utilise `press('Enter')` sur les étapes textuelles.

Code proposé dans `oracle-10-steps.spec.ts` :

```ts
if (await textInput.isVisible()) {
  await textInput.fill(`Réponse à l'étape ${i}`);

  const confirmerBtn = page.locator('button', {
    hasText: /Confirmer/i,
  });
  await expect(confirmerBtn).toBeVisible({ timeout: 5000 });
  await confirmerBtn.click();
} else {
  await choiceBtns.first().click();
  const confirmerBtn = page.locator('button', {
    hasText: /Confirmer/i,
  });
  await expect(confirmerBtn).toBeVisible({ timeout: 5000 });
  await confirmerBtn.click();
}
```

Et, si l'UX reste en deux temps :

```ts
const invokeBtn = page.locator('button', {
  hasText: /Invoquer Zarathoustra/i,
});
await expect(invokeBtn).toBeVisible({ timeout: 20000 });
await invokeBtn.click();
```

Effet :

- le test suit le flux réel
- il ne dépend plus d'un `Enter` potentiellement ambigu

## Conclusion

La cause du blocage n'est pas dans `drawFromRitual()` ni dans un contrôle caché sur `questionText`.  
Le blocage est architectural :

- `Confirmer` à l'étape 10 ne soumet pas l'oracle
- il lance seulement la guidance `guardian`
- la vraie soumission `oracle` est retenue derrière une seconde porte `GUIDANCE + canProceed`
- cette seconde porte dépend d'un état d'animation, pas d'un résultat métier

Le diagnostic le plus précis est donc :

**la requête finale n'est pas "oubliée" ; elle est simplement située dans un second embranchement UI que le flux de l'étape 10 ne rend pas assez explicite et qui peut rester fermé silencieusement.**
