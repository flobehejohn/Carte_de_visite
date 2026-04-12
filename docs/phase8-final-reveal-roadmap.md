# Phase 8 — Cadrage strict et cible UX (Final Reveal)

## Décisions d’architecture actées

1. **La lecture finale principale se fait en HTML/Tailwind.**
   La surface web est la source officielle pour lire la citation, l'interprétation, les sources et les actions utilisateur.

2. **La 3D finale est secondaire et atmosphérique.**
   Elle reste active pour porter l'aura, le climat et les particules, mais ne porte plus la prose longue.

3. **Le texte 3D final est soit absent, soit symbolique.**
   S'il reste du texte dans la 3D à la révélation, ce ne peut être qu'un fragment minimal (chapitre, mot-clé, chiffre). Il ne doit en aucun cas concurrencer le panneau HTML.

4. **Source unique de vérité.**
   Le système bascule sur une architecture de type `OracleProvider`. Tous les composants lisent le même `lastResult`.

5. **Périmètre préservé.**
   Le backend fail-closed, les contrats API et les VRT 3D existants sont verrouillés et considérés hors périmètre.
