# Proof pack — governed oracle/guardian integration

## Scope
Cette preuve documente l'état officialisé de la branche :

- Branche : feat/governed-oracle-guardian-integration-20260319

## Commits de référence
- HEAD : eacb58c3cb25f53f40d35224062d068e14cf2f50
- Checkpoint technique : d1c9945
- Commit de formalisation du scope : eacb58c

## Validations
- Typecheck : OK
- Tests : OK
- Runtime live sur 5173 : OK

## Runtime live
- Base URL : http://127.0.0.1:5173
- Guardian : HTTP 200
- Oracle : HTTP 200
- Oracle roles : anchor, tension, turn
- Oracle motif roles : anchor, tension, turn
- Oracle citations : 6

## Contenu du scope élargi
- enrichissement guardian/oracle gouverné
- invariants stricts étendus
- hermeneutic role normalization/validation
- composition wiring
- runtime tooling local : dev:unified, runtime-check, stop-local-stack

## Preuves stockées
- evidence/typecheck.log
- evidence/test.log
- evidence/runtime-check-5173.log
- evidence/guardian.5173.json
- evidence/oracle.5173.json
- meta/evidence.sha256.txt
- meta/evidence.sha256.csv
- meta/artifact-index.txt
- manifest.json

## Conclusion
L'état courant est techniquement stable, documenté, et revalidé en runtime live.
Le scope élargi est assumé explicitement comme état de référence.
