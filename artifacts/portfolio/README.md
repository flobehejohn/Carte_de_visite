# Portfolio de preuves — Oracle Zarathustra LLMed

## Rôle

Ce dossier n’est pas un dump d’audit. Il sert à sélectionner les preuves les plus lisibles pour présenter le projet comme une carte de visite technique : captures, logs résumés, extraits de contrats, rapports synthétiques et éléments de démonstration.

Différence importante :

| Zone | Usage |
|---|---|
| `.audit/` | exécution locale brute, non versionnée |
| `audit/_latest/` | état courant d’audit, non destiné à la présentation directe |
| `artifacts/portfolio/` | sélection curée, lisible, stable, versionnable si légère |

## Structure cible

```text
artifacts/portfolio/
  README.md
  01-ui/
  02-contract/
  03-gates/
  04-observability/
  05-ci/
  06-vercel/
```

## 01-ui

Preuves attendues :

- capture de l’écran d’accueil ;
- capture d’une étape du rituel ;
- capture de la réponse finale ;
- capture de la scène 3D en état lisible ;
- courte vidéo ou lien externe si le fichier est trop lourd.

## 02-contract

Preuves attendues :

- exemple de payload `/api/gemini` ;
- exemple de réponse `ok=true` ;
- extrait de `citationsUsed` ;
- preuve de source verrouillée ;
- extrait de violation fail-closed si utile.

## 03-gates

Preuves attendues :

- résumé `git diff --check` ;
- résultat `typecheck` ;
- résultat `test:optics` ;
- résultat `gate:bundle` ;
- résultat `gate-render.ps1` ;
- capture ou log court “green”.

## 04-observability

Preuves attendues :

- extrait `window.__ORB_AUDIT__` ;
- snapshot runtime ;
- audit runtime synthétique ;
- paramètres de qualité actifs ;
- état de rendu direct/composer si disponible.

## 05-ci

Preuves attendues :

- lien ou capture de workflow vert ;
- résumé de jobs ;
- artefact GitHub Actions si disponible ;
- preuve d’upload d’artefacts ;
- conventions de checks requis.

## 06-vercel

Preuves attendues :

- URL preview ou prod ;
- capture du statut Vercel Ready ;
- résultat de smoke preview/prod ;
- note sur les variables d’environnement ;
- incident connu et résolution si pertinent.

## Ce qui ne doit pas être déposé ici

- `node_modules/`
- `dist/`
- `.audit/` complet ;
- `audit/_latest/` complet ;
- secrets ou `.env` ;
- gros binaires non compressés ;
- traces Playwright complètes si elles alourdissent le repo.

## Critères d’acceptation d’une preuve portfolio

Une preuve est acceptable si elle est :

1. légère ;
2. lisible par un tiers ;
3. liée à un invariant ou une capacité démontrée ;
4. datée ou rattachée à un SHA ;
5. sans secret ;
6. utile pour décider rapidement de la maturité du projet.

## Statut actuel

Ce dossier prépare la structure de présentation. Les preuves lourdes restent à sélectionner depuis les audits locaux et les checks distants.

La synthèse certifiée est disponible dans :

- [`../../docs/certification/oracle-z-demo-certification.md`](../../docs/certification/oracle-z-demo-certification.md)
- [`../../docs/certification/evidence-index.md`](../../docs/certification/evidence-index.md)
