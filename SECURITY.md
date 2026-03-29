# Politique de sécurité

## Versions supportées

Le projet est en phase de stabilisation. La branche active la plus récente est considérée comme la référence de sécurité.

| Version                           | Support |
| --------------------------------- | ------- |
| branche active / HEAD             | ✅      |
| branches anciennes non maintenues | ❌      |

## Signaler une vulnérabilité

Merci de ne pas ouvrir d’issue publique pour une vulnérabilité exploitable.

Merci de privilégier un contact privé avec le propriétaire du dépôt via GitHub.

Dans le signalement, inclure si possible :

- une description du problème
- la surface impactée
- les conditions d’exploitation
- la sévérité estimée
- les étapes de reproduction
- une preuve de concept minimale
- une proposition de correctif si disponible

## Ce qui est attendu du mainteneur

Le mainteneur essaiera de :

- accuser réception rapidement
- qualifier la sévérité
- préparer un correctif raisonnable
- limiter la divulgation publique avant correction

## Périmètre sensible

Une attention particulière est attendue sur :

- les routes serveur
- la gestion des contrats JSON
- les invariants fail-closed
- la couche knowledge / corpus
- les scripts CI / audit
- les secrets et variables d’environnement
- les dépendances externes

## Bonnes pratiques pour les contributeurs

- ne jamais committer de secret
- ne pas exposer publiquement une faille exploitable
- réduire les PoC au strict nécessaire
- conserver des reproductions minimales et traçables
