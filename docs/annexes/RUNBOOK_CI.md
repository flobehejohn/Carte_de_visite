# RUNBOOK CI / Contrat / E2E

## 1. Objet

Ce runbook décrit la procédure de validation locale et CI du repo :

`C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed_wt_fix`

Il couvre :

- les tests unitaires et de contrat
- la validation du contrat JSON Gemini
- le runtime `vercel dev`
- le harnais E2E local
- la certification répétée (`contract-certify.ps1`)
- le wrapper CI global (`validate-full.ps1` / `gate.ps1`)

---

## 2. Politique contractuelle Phase 0

La Phase 0 est validée selon la politique suivante :

### Option B — strict sur état final normalisé

Un run est accepté si, après orchestration complète :

1. le JSON final retenu est valide au schéma
2. `finalJsonError === null`
3. `knowledge.corpusLoaded === true`
4. `citationsUsed.length >= minCitations`
5. toutes les citations proviennent de `zarathoustra`
6. les violations strictes sont calculées sur l’état final normalisé

### Observabilité obligatoire

La réponse doit exposer au minimum :

- `traceId`
- `timings.totalMs`
- `timings.llmMs`
- `timings.retrieveMs`
- `raw.reason`
- `retryCount`
- `fallback`
- `repairApplied`
- `raw.structured`
- `structuredUsed`
- `rawJsonError`
- `finalJsonError`
- `knowledge.corpusLoaded`
- `citationsCount`
- `sources`

### Sémantique des champs

- `raw.structured` : indique si le provider a réellement répondu en structuré natif
- `structuredUsed` : indique si l’état final retenu respecte le contrat structuré
- `rawJsonError` : erreur du premier jet brut / provider
- `finalJsonError` : erreur de l’état final retenu
- `jsonError` : alias de compatibilité de `finalJsonError`

Conséquence :

- `rawJsonError` peut être non nul
- `finalJsonError` doit être nul pour accepter le run
- `ok === true` ne dépend que de l’état final contractuel, pas du premier accident brut

---

## 3. Pré-requis

### Outils

- PowerShell 7+
- Node.js / npm
- Vercel CLI
- dépendances du repo installées via `npm ci`

### Auth / configuration

- être authentifié côté Vercel si utilisation de `vercel dev`
- disposer d’un `.env.local` valide au repo root
- la clé `GEMINI_API_KEY` doit être présente si un appel runtime réel est requis

### Exemple

```powershell
Set-Location "C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed_wt_fix"
npm ci
```
