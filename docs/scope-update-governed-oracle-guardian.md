# Scope update — governed oracle/guardian integration

Etat validé :
- typecheck OK
- tests OK
- runtime live OK sur 5173

Constat :
Le delta courant dépasse un scope R2bis strict "observability only".
Il inclut désormais :
- enrichissement guardian/oracle gouverné
- invariants stricts étendus
- hermeneutic role normalization/validation
- composition wiring
- runtime tooling local (dev unified, runtime-check, stop-local-stack)

Décision :
Cette branche assume explicitement le scope élargi comme état de référence.
Un cleanup de séparation pourra être fait ensuite si nécessaire.
