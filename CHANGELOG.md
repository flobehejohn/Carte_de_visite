# Changelog

Ce projet suit une convention de type Keep a Changelog et une stratégie SemVer.

## [Unreleased]

### Added

- CI GitHub avec jobs distincts pour typecheck, tests et build
- upload d’artefacts CI utiles au diagnostic
- garde d’intégrité du manifest knowledge
- script de régénération du manifest knowledge
- base de gouvernance dépôt : CODEOWNERS, CONTRIBUTING, SECURITY

### Changed

- stabilisation de la vérification cross-OS du manifest de connaissance
- durcissement de la chaîne de validation locale et GitHub

### Fixed

- suppression du log non versionné du manifest knowledge
- neutralisation des écarts d’intégrité dépendants de l’OS sur la couche knowledge

## [0.0.1] - Initial baseline

### Added

- base applicative front + serveur
- typecheck séparé client / serveur
- tests Vitest
- build Vite / TypeScript
- contrats de réponse Gemini
- couche knowledge Zarathoustra
