# ArchiLab — Instructions de développement pour Claude Code

## 1. Contexte du projet

ArchiLab est une plateforme web éducative destinée aux élèves du secondaire (environ 12 à 17 ans) qui souhaitent découvrir l'architecture et le métier d'architecte.

L'objectif n'est pas de proposer des cours traditionnels, mais des **mini-jeux interactifs, visuels et stimulants** inspirés des tâches réelles d'un architecte.

Les élèves doivent pouvoir expérimenter, manipuler des éléments, résoudre des problèmes et comprendre progressivement les concepts architecturaux.

Le projet est accessible sur GitHub Pages :

https://eduarchi.xyz/

Dépôt GitHub : https://github.com/voirinprof/archilab

## 2. Contraintes techniques impératives

Le projet repose sur React, TypeScript et Vite.

Il doit rester compatible avec GitHub Pages et fonctionner entièrement dans le navigateur.

**Interdictions :**
- Aucun backend ou serveur applicatif.
- Aucune base de données.
- Aucun compte utilisateur ni authentification.
- Aucun suivi des utilisateurs.
- Aucun enregistrement de résultats ou de progression.
- Aucun recours à localStorage, sessionStorage ou IndexedDB pour conserver des données.
- Aucun cookie applicatif.
- Aucun outil d'analytics ou de télémétrie.
- Aucun appel à une API externe nécessaire au fonctionnement des jeux.

Les jeux doivent fonctionner sans connexion réseau après chargement des ressources nécessaires.

L'état des jeux est temporaire et conservé uniquement en mémoire React.

Les dépendances doivent être installées et intégrées à la compilation plutôt que chargées depuis des CDN à l'exécution.

## 3. Architecture des mini-jeux

Les défis sont décrits dans des fichiers YAML.

Chaque fichier définit :
- Un identifiant unique et stable.
- Un titre et une description.
- Une catégorie.
- Le moteur de jeu utilisé.
- Une durée indicative.
- Le niveau de difficulté.
- Une mission.
- Les paramètres configurables.
- Les contraintes à respecter.
- Les indices pédagogiques.
- Les messages de réussite et d'échec.
- Éventuellement des ressources statiques complémentaires.

Les moteurs JavaScript/TypeScript implémentent les interactions, les calculs et les validations.

**Règle fondamentale : séparer le contenu pédagogique de la logique du jeu.**

Avant de développer un nouveau défi :

1. Examiner la structure actuelle du dépôt.
2. Identifier les moteurs disponibles.
3. Vérifier si le nouveau défi peut utiliser un moteur existant.
4. Privilégier un nouveau fichier YAML lorsqu'aucune nouvelle mécanique n'est nécessaire.
5. Créer un nouveau moteur uniquement si les interactions l'exigent.
6. Éviter de dupliquer les composants, les fonctions et les validations.

Les YAML doivent être validés pendant la compilation.

Ne pas supposer que l'architecture actuelle correspond exactement à une structure théorique : inspecter les fichiers existants avant toute modification.

## 4. Bilinguisme

ArchiLab est bilingue français/anglais.

Le français est la langue par défaut.

Tous les nouveaux défis doivent proposer leurs textes en français et en anglais :

```yaml
title:
  fr: "Chasse au soleil"
  en: "Chasing Sunlight"

mission:
  fr: "Oriente la maison pour maximiser la lumière naturelle."
  en: "Orient the house to maximize natural daylight."
```

Les règles, paramètres numériques et mécanismes sont communs aux deux langues.

Tous les textes visibles doivent être traduits : consignes, boutons, indices, messages, unités et textes d'aide.

La langue choisie ne doit pas être enregistrée dans le navigateur.

## 5. Principes pédagogiques

Chaque défi doit :

- Être compréhensible sans connaissances préalables en architecture.
- Pouvoir être réalisé en 3 à 10 minutes environ.
- Présenter une mission concrète inspirée du travail d'un architecte.
- Favoriser l'expérimentation plutôt que la mémorisation.
- Proposer des manipulations visuelles lorsque c'est pertinent.
- Fournir des rétroactions immédiates et compréhensibles.
- Expliquer brièvement la notion découverte.
- Permettre de recommencer facilement.
- Proposer des indices progressifs.
- Accepter plusieurs solutions lorsqu'elles sont pertinentes.

Éviter les questionnaires à choix multiples lorsque le concept peut être exploré avec une véritable interaction.

Les simulations physiques, thermiques ou structurelles doivent être clairement présentées comme des simplifications pédagogiques et non comme des outils d'ingénierie.

## 6. Interface et expérience utilisateur

Conserver l'identité graphique actuelle d'ArchiLab.

L'interface doit être :
- Moderne, soignée et attrayante.
- Adaptée aux adolescents sans être infantilisante.
- Responsive sur ordinateur, tablette et mobile.
- Accessible au clavier lorsque possible.
- Lisible et utilisable sans instructions complexes.

Privilégier :
- SVG pour les illustrations et interactions 2D simples.
- Canvas ou une bibliothèque adaptée pour les interactions 2D plus complexes.
- Three.js lorsque la manipulation 3D apporte une réelle valeur pédagogique.
- Des animations discrètes et utiles à la compréhension.

Ne pas introduire de nouvelles bibliothèques sans justification.

## 7. Catalogue des activités

Chaque nouveau jeu doit être automatiquement intégré au catalogue à partir de ses métadonnées YAML.

Le catalogue doit permettre de découvrir les défis par thématique, par exemple :
- Besoins du client.
- Analyse de terrain.
- Organisation des espaces.
- Formes et volumes.
- Lumière naturelle.
- Structures.
- Matériaux.
- Confort et accessibilité.
- Lecture de plans et chantier.
- Ville et environnement.

Ne pas ajouter de mécanisme de progression obligatoire, de compte ou de classement.

## 8. Qualité du code

Utiliser TypeScript avec des types explicites.

Favoriser des composants React réutilisables.

Séparer les fonctions de calcul et de validation des composants visuels.

Prévoir des tests unitaires pour les calculs et les règles importantes.

Éviter les valeurs pédagogiques codées en dur lorsque celles-ci pourraient être définies dans le YAML.

Préserver les fonctionnalités existantes.

Vérifier que le projet compile avec :

```bash
npm run build
```

Maintenir la configuration Vite compatible avec le domaine personnalisé https://eduarchi.xyz/ sur GitHub Pages : le site est servi à la racine, donc `base: '/'` dans `vite.config.ts`.

Ne pas modifier le workflow de déploiement sans nécessité.

## 9. Méthode de travail

Lorsqu'un nouveau défi est demandé :

**Étape A — Analyse**

Examiner le code et proposer brièvement :
- Le concept pédagogique.
- Les interactions de l'élève.
- Les critères de réussite.
- Le moteur existant à réutiliser ou le nouveau moteur nécessaire.
- Les fichiers à créer ou modifier.

**Étape B — Implémentation**

Développer un défi entièrement fonctionnel, avec :
- Son fichier YAML bilingue.
- Son interface interactive.
- Ses règles de validation.
- Ses indices.
- Ses messages de rétroaction.
- Son intégration au catalogue.

**Étape C — Vérification**

Vérifier :
- Le fonctionnement des interactions.
- Les valeurs limites.
- Le français et l'anglais.
- L'affichage mobile.
- L'absence de stockage ou de collecte de données.
- La compilation Vite.
- La compatibilité GitHub Pages.

**Étape D — Compte rendu**

À la fin, indiquer :
- Les fichiers créés et modifiés.
- Les fonctionnalités ajoutées.
- Les tests effectués et leurs résultats.
- Les éventuelles limites.
- Les améliorations possibles.

Ne pas effectuer automatiquement de commit ou de push sans demande explicite.

## 10. Priorité générale

ArchiLab doit rester une collection de mini-jeux indépendants, faciles à enrichir et agréables à utiliser.

L'objectif prioritaire est la découverte de l'architecture par l'expérimentation.

La qualité pédagogique, la simplicité des interactions et la cohérence du projet priment sur la sophistication technique.
